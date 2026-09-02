import { FinancialEvent } from "./financial.model";
import { KnownAccount } from "./knownAccount.model";
import { KnownAccountIndex } from "./knownAccounts";
import {
    inferOwnedAccountType,
    inferOwnedAccountTypeFromTxn,
} from "./financial.accountType";
import {
    cardBillPayNamedBank,
    isCardBillPayMessage,
    isEquityBuyMessage,
    isGrowwFundingMessage,
    isIndianClearingSipMessage,
    isMutualFundMessage,
    isNewFdMessage,
    isSgbMessage,
    isZerodhaFundingMessage,
} from "./financial.kind";
import { uniqueCardBillPayDestLast4, type DueReminderIdentity } from "./financial.due";

export type DhanMapBucket = "mapped" | "unique-bank" | "unmapped";

export interface DhanAccountResolution {
    bucket: DhanMapBucket;
    account?: KnownAccount;
}

/**
 * Resolves a posted event to an owned account without calling Firefly.
 * Last4 exact match first. When last4 is missing: unique (bank + type), then unique bank.
 *
 * @param event - Row from financial_events or a candidate event
 * @param accounts - Owned last4 index
 * @param body - SMS body; used to infer savings vs card vs loan
 */
export function resolveDhanAccount(
    event: Pick<FinancialEvent, "accountLast4" | "bank" | "transactionType">,
    accounts: KnownAccountIndex,
    body?: string
): DhanAccountResolution {
    if (event.accountLast4) {
        const exact = accounts.resolve(event.accountLast4);

        if (exact) {
            return { bucket: "mapped", account: exact };
        }

        return { bucket: "unmapped" };
    }

    if (!event.bank) {
        return { bucket: "unmapped" };
    }

    const type =
        (body ? inferOwnedAccountType(body) : undefined) ??
        inferOwnedAccountTypeFromTxn(event.transactionType);

    if (type) {
        const uniqueTyped = accounts.resolveUniqueByBankAndType(event.bank, type);

        if (uniqueTyped) {
            return { bucket: "unique-bank", account: uniqueTyped };
        }
    }

    const unique = accounts.resolveUniqueByBank(event.bank);

    if (unique) {
        return { bucket: "unique-bank", account: unique };
    }

    return { bucket: "unmapped" };
}

/**
 * Investment bucket the SMS funded (FD at the source bank, or MF / SGB / demat).
 *
 * @param event - Posted event with optional source bank
 * @param body - SMS body
 * @param accounts - Owned last4 index
 */
export function resolveInvestmentDestination(
    event: Pick<FinancialEvent, "bank">,
    body: string,
    accounts: KnownAccountIndex
): KnownAccount | undefined {
    if (isMutualFundMessage(body) || isIndianClearingSipMessage(body) || isGrowwFundingMessage(body)) {
        return accounts.resolveUniqueByBankAndType("Mutual Fund", "investment");
    }

    if (isSgbMessage(body)) {
        return accounts.resolveUniqueByBankAndType("SGB", "investment");
    }

    if (isEquityBuyMessage(body) || isZerodhaFundingMessage(body)) {
        return accounts.resolveUniqueByBankAndType("Demat", "investment");
    }

    if (isNewFdMessage(body) && event.bank) {
        return accounts.resolveUniqueByBankAndType(event.bank, "investment");
    }

    return undefined;
}

/**
 * Card the bill-pay SMS funded: unique named-bank CC (SBI Cards / Axis), else
 * the unique last4 whose due matches amount ±₹1. Ambiguous CRED/CheQ stays empty.
 *
 * @param event - Posted bill-pay with amount and time
 * @param body - SMS body
 * @param accounts - Owned last4 index
 * @param dues - Unique card due reminders (optional; needed for CRED/CheQ)
 */
export function resolveCardBillPayDestination(
    event: Pick<FinancialEvent, "smsId" | "amount" | "occurredAt">,
    body: string,
    accounts: KnownAccountIndex,
    dues?: DueReminderIdentity[]
): KnownAccount | undefined {
    if (!isCardBillPayMessage(body)) {
        return undefined;
    }

    const namedBank = cardBillPayNamedBank(body);

    if (namedBank) {
        const unique = accounts.resolveUniqueByBankAndType(namedBank, "credit_card");

        if (unique) {
            return unique;
        }
    }

    if (!dues?.length) {
        return undefined;
    }

    const last4 = uniqueCardBillPayDestLast4(
        {
            smsId: event.smsId,
            occurredAt: event.occurredAt,
            accountLast4: null,
            amount: event.amount,
            matchCardDuesByAmount: true,
            cardPayBank: namedBank,
        },
        dues
    );

    return last4 ? accounts.resolve(last4) : undefined;
}

/**
 * Stamps resolved last4/name onto the event when classify left them empty.
 * Investment events also get counterpartyLast4 for the destination bucket.
 * Card bill-pays get the destination card last4 when it is uniquely known.
 *
 * @param event - Candidate financial event
 * @param accounts - Owned last4 index
 * @param body - SMS body for type inference
 * @param dues - Unique card due reminders for CRED/CheQ dest last4
 */
export function stampDhanAccount(
    event: FinancialEvent,
    accounts: KnownAccountIndex,
    body?: string,
    dues?: DueReminderIdentity[]
): { event: FinancialEvent; resolution: DhanAccountResolution } {
    const resolution = resolveDhanAccount(event, accounts, body);

    if (!resolution.account) {
        return { event, resolution };
    }

    const next: FinancialEvent = {
        ...event,
        accountLast4: event.accountLast4 ?? resolution.account.last4,
        accountName: event.accountName ?? resolution.account.name,
        bank: event.bank ?? resolution.account.bank,
    };

    if (event.kind === "investment" && !next.counterpartyLast4) {
        const destination = resolveInvestmentDestination(next, body ?? "", accounts);

        if (destination) {
            next.counterpartyLast4 = destination.last4;
        }
    }

    if (event.kind === "bill" && !next.counterpartyLast4) {
        const destination = resolveCardBillPayDestination(next, body ?? "", accounts, dues);

        if (destination) {
            next.counterpartyLast4 = destination.last4;
        }
    }

    return { resolution, event: next };
}

/**
 * Returns true when the event belongs to an owned last4 or a unique-bank account.
 *
 * @param event - Candidate financial event
 * @param accounts - Owned last4 index
 * @param body - SMS body for type inference
 */
export function isOwnedDhanEvent(
    event: Pick<FinancialEvent, "accountLast4" | "bank" | "transactionType">,
    accounts: KnownAccountIndex,
    body?: string
): boolean {
    return resolveDhanAccount(event, accounts, body).bucket !== "unmapped";
}

/**
 * Resolves the transfer destination last4 to an owned account.
 *
 * @param event - Posted event with counterparty_last4
 * @param accounts - Owned last4 index
 */
export function resolveDhanCounterparty(
    event: Pick<FinancialEvent, "counterpartyLast4">,
    accounts: KnownAccountIndex
): DhanAccountResolution {
    if (!event.counterpartyLast4) {
        return { bucket: "unmapped" };
    }

    const exact = accounts.resolve(event.counterpartyLast4);

    if (exact) {
        return { bucket: "mapped", account: exact };
    }

    return { bucket: "unmapped" };
}
