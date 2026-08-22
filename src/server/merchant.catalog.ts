import { FinancialParser } from "../classifiers/financial/financial.parser";
import {
    merchantCatalogKey,
    resolveMerchantAlias,
    spendMerchantLabel,
    type MerchantAlias,
    type MerchantSpendTotal,
    type SmsSpendOverride,
} from "../classifiers/financial/financial.spend";
import { isInvestmentFundingMessage } from "../classifiers/financial/financial.kind";

/** Expense with no `financial_events.merchant` (older classify). */
export interface MissingMerchantExpense {
    smsId: number;
    amount: number;
    occurredAt: Date;
    pushed: boolean;
    body: string;
}

/** Expense used to list every SMS under one catalog key. */
export interface MerchantExpenseSms {
    smsId: number;
    merchant?: string;
    amount: number;
    occurredAt: Date;
    body?: string;
    pushed?: boolean;
}

/**
 * Catalog key after recovering a blank or card-POS stub merchant from the SMS body.
 *
 * @param storedMerchant - `financial_events.merchant`
 * @param body - SMS body when the stored merchant is empty
 * @param parser - Shared parser instance
 * @returns Catalog key used on the Merchants page
 */
export function expenseCatalogKey(
    storedMerchant: string | undefined,
    body: string | undefined,
    parser: FinancialParser
): string {
    return merchantCatalogKey(expenseMerchant(storedMerchant, body, parser));
}

/**
 * Display merchant after recovering a blank or card-POS stub from the SMS body.
 *
 * Stored `IND` from `IND*LinkedIn` / `IND*Amazon` is re-parsed so each shop is its own catalog row.
 *
 * @param storedMerchant - `financial_events.merchant`
 * @param body - SMS body when the stored merchant is empty or a POS prefix
 * @param parser - Shared parser instance
 */
export function expenseMerchant(
    storedMerchant: string | undefined,
    body: string | undefined,
    parser: FinancialParser
): string {
    const stored = storedMerchant?.trim();
    const text = body ?? "";

    if (stored && isCardPosMerchantStub(stored, text)) {
        return parser.extractMerchantFromBody(text) || stored;
    }

    return stored || parser.extractMerchantFromBody(text) || "Unknown";
}

/**
 * True when `stored` is a 2–5 letter POS prefix and the SMS still has `PREFIX*Shop`.
 */
function isCardPosMerchantStub(stored: string, body: string): boolean {
    if (!/^[A-Za-z]{2,5}$/.test(stored)) {
        return false;
    }

    return new RegExp(`(?:^|\\s)${stored}\\*[A-Za-z]{3,}`, "i").test(body);
}

/**
 * Catalog key for one expense after a per-SMS merchant move.
 *
 * @param storedMerchant - `financial_events.merchant`
 * @param body - SMS body when the stored merchant is empty
 * @param parser - Shared parser instance
 * @param override - Optional merchant move
 * @param aliases - Optional rename / merge map
 */
export function effectiveCatalogKey(
    storedMerchant: string | undefined,
    body: string | undefined,
    parser: FinancialParser,
    override?: Pick<SmsSpendOverride, "merchantKey"> | null,
    aliases?: ReadonlyMap<string, MerchantAlias>
): string {
    const raw = override?.merchantKey || expenseCatalogKey(storedMerchant, body, parser);
    return resolveMerchantAlias(raw, aliases).key;
}

/**
 * Groups expense SMS into merchant totals, honoring per-SMS merchant moves.
 *
 * @param rows - Expense SMS with stored or recoverable merchants
 * @param overrides - `sms_spend_overrides` keyed by SMS id
 * @param aliases - Optional rename / merge map
 */
export function groupExpenseTotals(
    rows: MerchantExpenseSms[],
    overrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>
): MerchantSpendTotal[] {
    const parser = new FinancialParser();
    const recovered = new Map<string, MerchantSpendTotal>();

    for (const row of rows) {
        if (isInvestmentFundingMessage(row.body ?? "")) {
            continue;
        }

        const override = overrides?.get(row.smsId);
        const patternMerchant = expenseMerchant(row.merchant, row.body, parser);
        const rawKey = override?.merchantKey || merchantCatalogKey(patternMerchant);
        const resolved = resolveMerchantAlias(rawKey, aliases);
        const catalogKey = resolved.key;
        const merchant =
            resolved.label ||
            override?.merchantLabel?.trim() ||
            override?.merchantKey ||
            patternMerchant;
        const existing = recovered.get(catalogKey);
        const pushed = Boolean(row.pushed);

        if (existing) {
            existing.txCount += 1;
            existing.pushedCount = (existing.pushedCount ?? 0) + (pushed ? 1 : 0);
            existing.totalAmount += row.amount;

            if (row.occurredAt >= existing.lastSeenAt) {
                existing.lastSeenAt = row.occurredAt;
                existing.merchant = merchant;
                existing.sampleSmsIds = uniqueSmsIds([row.smsId, ...(existing.sampleSmsIds ?? [])]);
            } else {
                existing.sampleSmsIds = uniqueSmsIds([...(existing.sampleSmsIds ?? []), row.smsId]);
            }

            continue;
        }

        recovered.set(catalogKey, {
            merchant,
            catalogKey,
            txCount: 1,
            pushedCount: pushed ? 1 : 0,
            sampleSmsIds: [row.smsId],
            totalAmount: row.amount,
            lastSeenAt: row.occurredAt,
        });
    }

    return [...recovered.values()];
}

/**
 * SMS rows for one merchant catalog key, newest first.
 *
 * @param named - Expenses that already have a stored merchant
 * @param missing - Expenses with a blank merchant
 * @param key - {@link merchantCatalogKey}
 * @param overrides - Optional per-SMS merchant moves
 * @param aliases - Optional rename / merge map
 */
export function listSmsForMerchantKey(
    named: MerchantExpenseSms[],
    missing: MissingMerchantExpense[],
    key: string,
    overrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>
): MerchantExpenseSms[] {
    const parser = new FinancialParser();
    const rows: MerchantExpenseSms[] = [];

    for (const row of named) {
        if (isInvestmentFundingMessage(row.body ?? "")) {
            continue;
        }

        if (
            effectiveCatalogKey(
                row.merchant,
                row.body,
                parser,
                overrides?.get(row.smsId),
                aliases
            ) === key
        ) {
            rows.push({
                ...row,
                merchant:
                    overrides?.get(row.smsId)?.merchantLabel?.trim() ||
                    spendMerchantLabel(expenseMerchant(row.merchant, row.body, parser)),
            });
        }
    }

    for (const row of missing) {
        if (isInvestmentFundingMessage(row.body)) {
            continue;
        }

        if (effectiveCatalogKey(undefined, row.body, parser, overrides?.get(row.smsId), aliases) === key) {
            rows.push({
                smsId: row.smsId,
                merchant:
                    overrides?.get(row.smsId)?.merchantLabel?.trim() ||
                    spendMerchantLabel(parser.extractMerchantFromBody(row.body) ?? "Unknown"),
                amount: row.amount,
                occurredAt: row.occurredAt,
                body: row.body,
                pushed: row.pushed,
            });
        }
    }

    return rows.sort((left, right) => {
        const delta = right.occurredAt.getTime() - left.occurredAt.getTime();
        return delta !== 0 ? delta : right.smsId - left.smsId;
    });
}

/**
 * Re-parses SMS bodies for blank-merchant expenses so Blinkit / Amazon / etc.
 * do not collapse into one Unknown row on the Merchants page.
 *
 * @param grouped - SQL totals (includes a single Unknown bucket)
 * @param missing - Expense rows whose stored merchant is empty
 */
export function recoverUnknownMerchantTotals(
    grouped: MerchantSpendTotal[],
    missing: MissingMerchantExpense[]
): MerchantSpendTotal[] {
    const named = grouped.filter((row) => row.merchant !== "Unknown");

    if (missing.length === 0) {
        return grouped;
    }

    const parser = new FinancialParser();
    const recovered = new Map<string, MerchantSpendTotal>();

    for (const row of missing) {
        const merchant = parser.extractMerchantFromBody(row.body) ?? "Unknown";
        const existing = recovered.get(merchant);

        if (existing) {
            existing.txCount += 1;
            existing.pushedCount = (existing.pushedCount ?? 0) + (row.pushed ? 1 : 0);
            existing.totalAmount += row.amount;

            if (row.occurredAt >= existing.lastSeenAt) {
                existing.lastSeenAt = row.occurredAt;
                existing.sampleSmsIds = uniqueSmsIds([
                    row.smsId,
                    ...(existing.sampleSmsIds ?? []),
                ]);
            } else {
                existing.sampleSmsIds = uniqueSmsIds([
                    ...(existing.sampleSmsIds ?? []),
                    row.smsId,
                ]);
            }

            continue;
        }

        recovered.set(merchant, {
            merchant,
            txCount: 1,
            pushedCount: row.pushed ? 1 : 0,
            sampleSmsIds: [row.smsId],
            totalAmount: row.amount,
            lastSeenAt: row.occurredAt,
        });
    }

    return [...named, ...recovered.values()];
}

function uniqueSmsIds(ids: number[]): number[] {
    const seen = new Set<number>();
    const out: number[] = [];

    for (const id of ids) {
        if (seen.has(id)) {
            continue;
        }

        seen.add(id);
        out.push(id);

        if (out.length >= 3) {
            break;
        }
    }

    return out;
}
