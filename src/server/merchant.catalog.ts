import { FinancialParser } from "../classifiers/financial/financial.parser";
import type { MerchantSpendTotal } from "../classifiers/financial/financial.spend";

/** Expense with no `financial_events.merchant` (older classify). */
export interface MissingMerchantExpense {
    smsId: number;
    amount: number;
    occurredAt: Date;
    pushed: boolean;
    body: string;
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
