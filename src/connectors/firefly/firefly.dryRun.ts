import { inferOwnedAccountTypeFromTxn } from "../../classifiers/financial/financial.accountType";
import { spendBucket, spendBucketLabel } from "../../classifiers/financial/financial.spend";
import { FinancialEvent } from "../../classifiers/financial/financial.model";
import { KnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { FireflyLast4Index } from "./firefly.accountMap";
import { FireflyOpenings } from "./firefly.openings";
import { FireflyDryRunRow, PlannedFireflyTransaction } from "./firefly.types";

/**
 * Maps a posted event to a Firefly payload without calling the API.
 *
 * @param event - Row from financial_events
 * @param firefly - Last4 → Firefly account
 * @param owned - Local owned accounts (unique-bank when last4 is missing)
 * @param openings - Ledger opening dates; events before these are skipped
 */
export function planFireflyTransaction(
    event: FinancialEvent,
    firefly: FireflyLast4Index,
    owned: KnownAccountIndex,
    openings: FireflyOpenings = new FireflyOpenings(new Map())
): FireflyDryRunRow {
    const sourceLast4 = event.accountLast4 ?? uniqueBankLast4(event, owned);
    const skipReason = openings.skipReason(event, sourceLast4);

    if (skipReason) {
        return blocked(event, skipReason, true);
    }

    if (event.kind === "transfer" || event.kind === "investment") {
        return planTransfer(event, sourceLast4, firefly);
    }

    if (!sourceLast4) {
        return blocked(event, "no last4 and bank is not unique");
    }

    const source = resolveLeg(sourceLast4, firefly, "source");

    if (!source.ok) {
        return blocked(event, source.reason);
    }

    if (event.cashFlow === "INFLOW") {
        return {
            ok: true,
            plan: basePlan(event, "deposit", {
                destinationId: source.account.id,
                sourceName: event.merchant ?? event.kind,
            }),
        };
    }

    if (event.cashFlow === "OUTFLOW") {
        return {
            ok: true,
            plan: basePlan(event, "withdrawal", {
                sourceId: source.account.id,
                destinationName: event.merchant ?? event.kind,
            }),
        };
    }

    return blocked(event, `cashFlow ${event.cashFlow} is not a Firefly post`);
}

function planTransfer(
    event: FinancialEvent,
    sourceLast4: string | undefined,
    firefly: FireflyLast4Index
): FireflyDryRunRow {
    const destLast4 = event.counterpartyLast4;

    if (!sourceLast4) {
        return blocked(event, "transfer missing source last4");
    }

    if (!destLast4) {
        return blocked(event, "transfer missing counterparty_last4");
    }

    const source = resolveLeg(sourceLast4, firefly, "source");

    if (!source.ok) {
        return blocked(event, source.reason);
    }

    const dest = resolveLeg(destLast4, firefly, "destination");

    if (!dest.ok) {
        return blocked(event, dest.reason);
    }

    return {
        ok: true,
        plan: basePlan(event, "transfer", {
            sourceId: source.account.id,
            destinationId: dest.account.id,
        }),
    };
}

function resolveLeg(
    last4: string,
    firefly: FireflyLast4Index,
    label: "source" | "destination"
): { ok: true; account: { id: string } } | { ok: false; reason: string } {
    if (firefly.isConflict(last4)) {
        return { ok: false, reason: `${label} last4 ${last4} is duplicated in Firefly` };
    }

    const account = firefly.resolve(last4);

    if (!account) {
        return { ok: false, reason: `no Firefly account for ${label} last4 ${last4}` };
    }

    return { ok: true, account };
}

function uniqueBankLast4(
    event: Pick<FinancialEvent, "bank" | "transactionType">,
    owned: KnownAccountIndex
): string | undefined {
    if (!event.bank) {
        return undefined;
    }

    const type = inferOwnedAccountTypeFromTxn(event.transactionType);

    if (type) {
        const uniqueTyped = owned.resolveUniqueByBankAndType(event.bank, type);

        if (uniqueTyped) {
            return uniqueTyped.last4;
        }
    }

    return owned.resolveUniqueByBank(event.bank)?.last4;
}

function basePlan(
    event: FinancialEvent,
    type: PlannedFireflyTransaction["type"],
    legs: Partial<Pick<
        PlannedFireflyTransaction,
        "sourceId" | "destinationId" | "sourceName" | "destinationName"
    >>
): PlannedFireflyTransaction {
    const plan: PlannedFireflyTransaction = {
        smsId: event.smsId,
        type,
        amount: event.amount.toFixed(2),
        date: event.occurredAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        description: event.merchant ?? event.kind,
        externalId: `narada-sms-${event.smsId}`,
        ...legs,
    };

    if (type === "withdrawal") {
        plan.categoryName = spendBucketLabel(spendBucket(event.merchant));
    }

    return plan;
}

function blocked(
    event: FinancialEvent,
    reason: string,
    skip = false
): FireflyDryRunRow {
    return {
        ok: false,
        smsId: event.smsId,
        kind: event.kind,
        amount: event.amount,
        reason,
        skip,
    };
}
