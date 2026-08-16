import { FinancialEvent } from "./financial.model";
import { KnownAccount } from "./knownAccount.model";
import { KnownAccountIndex } from "./knownAccounts";

export type DhanMapBucket = "mapped" | "unique-bank" | "unmapped";

export interface DhanAccountResolution {
    bucket: DhanMapBucket;
    account?: KnownAccount;
}

/**
 * Resolves a posted event to an owned account without calling Firefly.
 * Last4 exact match first. Unique-bank only when last4 is missing.
 *
 * @param event - Row from financial_events or a candidate event
 * @param accounts - Owned last4 index
 */
export function resolveDhanAccount(
    event: Pick<FinancialEvent, "accountLast4" | "bank">,
    accounts: KnownAccountIndex
): DhanAccountResolution {
    if (event.accountLast4) {
        const exact = accounts.resolve(event.accountLast4);

        if (exact) {
            return { bucket: "mapped", account: exact };
        }

        return { bucket: "unmapped" };
    }

    if (event.bank) {
        const unique = accounts.resolveUniqueByBank(event.bank);

        if (unique) {
            return { bucket: "unique-bank", account: unique };
        }
    }

    return { bucket: "unmapped" };
}

/**
 * Returns true when the event belongs to an owned last4 or a unique-bank account.
 *
 * @param event - Candidate financial event
 * @param accounts - Owned last4 index
 */
export function isOwnedDhanEvent(
    event: Pick<FinancialEvent, "accountLast4" | "bank">,
    accounts: KnownAccountIndex
): boolean {
    return resolveDhanAccount(event, accounts).bucket !== "unmapped";
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
