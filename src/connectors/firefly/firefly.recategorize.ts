import { FinancialParser } from "../../classifiers/financial/financial.parser";
import { FinancialEvent } from "../../classifiers/financial/financial.model";
import { merchantCatalogKey } from "../../classifiers/financial/financial.spend";
import { FireflyClient } from "./firefly.client";

/** Max Firefly PUTs in one Merchants apply request. */
export const DHAN_RECATEGORIZE_CAP = 500;

/** Result of rewriting `category_name` on already-pushed Dhan withdrawals. */
export interface DhanRecategorizeStats {
    matched: number;
    updated: number;
    failed: number;
    remaining: number;
    errors: string[];
}

/**
 * Pushed expense events whose merchant collapses to this catalog key.
 *
 * @param events - Posted financial events (usually already pushed)
 * @param key - {@link merchantCatalogKey}
 * @param parser - SMS merchant extract for blank stored merchants
 */
export function pushedExpensesForMerchant(
    events: Array<FinancialEvent & { body?: string }>,
    key: string,
    parser = new FinancialParser()
): FinancialEvent[] {
    return events.filter((event) => {
        if (event.kind !== "expense" || !event.fireflyTransactionId) {
            return false;
        }

        const merchant =
            event.merchant || parser.extractMerchantFromBody(event.body ?? "");
        return merchantCatalogKey(merchant) === key;
    });
}

/**
 * PUTs `category_name` on Dhan journals for one merchant catalog key.
 *
 * @param client - Authenticated Firefly client
 * @param events - Pushed expense rows
 * @param key - Catalog id
 * @param categoryName - Firefly category label
 * @param cap - Max updates this call
 */
export async function applyMerchantCategoryToDhan(
    client: FireflyClient,
    events: Array<FinancialEvent & { body?: string }>,
    key: string,
    categoryName: string,
    cap = DHAN_RECATEGORIZE_CAP
): Promise<DhanRecategorizeStats> {
    const parser = new FinancialParser();
    const matched = pushedExpensesForMerchant(events, key, parser);
    const batch = matched.slice(0, cap);
    const stats: DhanRecategorizeStats = {
        matched: matched.length,
        updated: 0,
        failed: 0,
        remaining: Math.max(0, matched.length - batch.length),
        errors: [],
    };

    for (const event of batch) {
        const id = event.fireflyTransactionId;

        if (!id) {
            continue;
        }

        try {
            await client.updateTransactionCategory(id, categoryName);
            stats.updated += 1;
        } catch (error) {
            stats.failed += 1;

            if (stats.errors.length < 5) {
                stats.errors.push(
                    `#${event.smsId}: ${error instanceof Error ? error.message : "update failed"}`
                );
            }
        }
    }

    return stats;
}

/**
 * PUTs assigned categories onto matching Dhan journals (all assigned merchants).
 *
 * @param client - Authenticated Firefly client
 * @param events - Pushed expense rows
 * @param work - Catalog key + Firefly category label
 * @param cap - Max updates this call
 */
export async function applyAssignedCategoriesToDhan(
    client: FireflyClient,
    events: Array<FinancialEvent & { body?: string }>,
    work: Array<{ key: string; categoryName: string }>,
    cap = DHAN_RECATEGORIZE_CAP
): Promise<DhanRecategorizeStats> {
    const parser = new FinancialParser();
    const jobs = work.flatMap((row) =>
        pushedExpensesForMerchant(events, row.key, parser).map((event) => ({
            event,
            categoryName: row.categoryName,
        }))
    );
    const batch = jobs.slice(0, cap);
    const stats: DhanRecategorizeStats = {
        matched: jobs.length,
        updated: 0,
        failed: 0,
        remaining: Math.max(0, jobs.length - batch.length),
        errors: [],
    };

    for (const job of batch) {
        const id = job.event.fireflyTransactionId;

        if (!id) {
            continue;
        }

        try {
            await client.updateTransactionCategory(id, job.categoryName);
            stats.updated += 1;
        } catch (error) {
            stats.failed += 1;

            if (stats.errors.length < 5) {
                stats.errors.push(
                    `#${job.event.smsId}: ${error instanceof Error ? error.message : "update failed"}`
                );
            }
        }
    }

    return stats;
}
