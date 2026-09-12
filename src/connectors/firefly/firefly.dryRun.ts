import { inferOwnedAccountTypeFromTxn } from "../../classifiers/financial/financial.accountType";
import {
    resolveSpendBucket,
    spendBucketLabel,
    type MerchantAlias,
    type SmsSpendOverride,
    type SpendBucket,
} from "../../classifiers/financial/financial.spend";
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
 * @param assigned - Optional Narada merchant → spend bucket map
 * @param smsOverrides - Optional per-SMS category / merchant moves
 * @param aliases - Optional merchant rename / merge map
 * @param bucketLabels - Labels for user-created buckets
 */
export function planFireflyTransaction(
    event: FinancialEvent,
    firefly: FireflyLast4Index,
    owned: KnownAccountIndex,
    openings: FireflyOpenings = new FireflyOpenings(new Map()),
    assigned?: ReadonlyMap<string, SpendBucket>,
    smsOverrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>,
    bucketLabels?: ReadonlyMap<string, string>
): FireflyDryRunRow {
    const sourceLast4 = event.accountLast4 ?? uniqueBankLast4(event, owned);
    const skipReason = openings.skipReason(event, sourceLast4);

    if (skipReason) {
        return blocked(event, skipReason, true);
    }

    if (event.kind === "transfer" || event.kind === "investment" || event.kind === "bill") {
        return planTransfer(event, sourceLast4, firefly, owned);
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
            plan: basePlan(
                event,
                "withdrawal",
                {
                    sourceId: source.account.id,
                    destinationName: event.merchant ?? event.kind,
                },
                assigned,
                smsOverrides?.get(event.smsId),
                aliases,
                bucketLabels
            ),
        };
    }

    return blocked(event, `cashFlow ${event.cashFlow} is not a Firefly post`);
}

function planTransfer(
    event: FinancialEvent,
    sourceLast4: string | undefined,
    firefly: FireflyLast4Index,
    owned: KnownAccountIndex
): FireflyDryRunRow {
    const destLast4 = event.counterpartyLast4;

    if (!sourceLast4) {
        return blocked(event, "transfer missing source last4");
    }

    if (!destLast4) {
        return blocked(
            event,
            event.kind === "bill"
                ? "card bill-pay missing destination last4"
                : "transfer missing counterparty_last4"
        );
    }

    const source = resolveLeg(sourceLast4, firefly, "source");

    if (!source.ok) {
        return blocked(event, source.reason);
    }

    const dest = resolveDestLeg(destLast4, firefly, owned);

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

/**
 * Destination last4, or the unique Firefly account whose name matches the
 * owned card when Dhan has no account_number yet.
 *
 * @param last4 - Card last4 stamped on the bill-pay
 * @param firefly - Dhan last4 + name index
 * @param owned - Local owned accounts
 */
export function resolveDestLeg(
    last4: string,
    firefly: FireflyLast4Index,
    owned: KnownAccountIndex
): { ok: true; account: { id: string } } | { ok: false; reason: string } {
    const byLast4 = resolveLeg(last4, firefly, "destination");

    if (byLast4.ok) {
        return byLast4;
    }

    const ownedDest = owned.resolve(last4);
    const named = ownedDest ? firefly.resolveUniqueByName(ownedDest.name) : undefined;

    if (named) {
        return { ok: true, account: named };
    }

    return { ok: false, reason: missingDestAccountReason(last4, ownedDest?.name) };
}

/**
 * Home / Telegram copy when Dhan has no destination account for a card last4.
 *
 * @param last4 - Destination card last4
 * @param ownedName - Local account name when known
 */
export function missingDestAccountReason(last4: string, ownedName?: string): string {
    if (ownedName) {
        return `no Firefly account for destination last4 ${last4} — add ${ownedName} in Dhan with account number ${last4}`;
    }

    return `no Firefly account for destination last4 ${last4}`;
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
    >>,
    assigned?: ReadonlyMap<string, SpendBucket>,
    smsOverride?: SmsSpendOverride | null,
    aliases?: ReadonlyMap<string, MerchantAlias>,
    bucketLabels?: ReadonlyMap<string, string>
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
        plan.categoryName = spendBucketLabel(
            resolveSpendBucket(event.merchant, assigned, undefined, smsOverride, aliases),
            bucketLabels
        );
    }

    return plan;
}

/**
 * #122 started posting card bill-pays as transfers (5 Sep 2026 IST).
 * Rows pushed after this do not need a Firefly type GET.
 */
export const BILL_PAY_TRANSFER_SINCE_MS = Date.parse("2026-09-05T00:00:00+05:30");

/** Max Firefly GETs per ingest for leftover pre-#122 withdrawals. */
export const BILL_PAY_REWRITE_GET_LIMIT = 8;

/**
 * True when a posted card bill-pay might still be a withdrawal in Dhan
 * and is worth one Firefly GET this run.
 *
 * @param event - Row from financial_events
 * @param planOk - Dry-run can build a transfer payload
 */
export function shouldProbePostedBillPay(
    event: Pick<
        FinancialEvent,
        "kind" | "counterpartyLast4" | "fireflyTransactionId" | "fireflyPushedAt"
    >,
    planOk: boolean
): boolean {
    if (!planOk || !event.fireflyTransactionId) {
        return false;
    }

    if (event.kind !== "bill" || !event.counterpartyLast4) {
        return false;
    }

    if (event.fireflyPushedAt && event.fireflyPushedAt.getTime() >= BILL_PAY_TRANSFER_SINCE_MS) {
        return false;
    }

    return true;
}

/**
 * Unpushed events first so rewrite GETs cannot starve new Dhan posts.
 * `listAll` is oldest-first, so already-pushed bills were checked before
 * anything dated after 6 Sep.
 *
 * @param events - Oldest-first `financial_events`
 */
export function orderFireflyPushEvents<T extends { fireflyTransactionId?: string }>(
    events: readonly T[]
): T[] {
    const unpushed: T[] = [];
    const pushed: T[] = [];

    for (const event of events) {
        if (event.fireflyTransactionId) {
            pushed.push(event);
        } else {
            unpushed.push(event);
        }
    }

    return [...unpushed, ...pushed];
}

/**
 * True when a posted card bill-pay already sits in Dhan as a withdrawal and
 * should become a savings→card transfer.
 *
 * @param event - Row from financial_events
 * @param fireflyType - Current Firefly split type
 */
export function shouldRewritePostedBillPay(
    event: Pick<FinancialEvent, "kind" | "counterpartyLast4">,
    fireflyType: string | undefined
): boolean {
    return event.kind === "bill" && Boolean(event.counterpartyLast4) && fireflyType === "withdrawal";
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
