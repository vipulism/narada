import { FinancialParser } from "../../classifiers/financial/financial.parser";
import { FinancialEvent } from "../../classifiers/financial/financial.model";
import {
    merchantCatalogKey,
    spendBucketLabel,
    type SmsSpendOverride,
    type SpendBucket,
} from "../../classifiers/financial/financial.spend";
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
 * @param overrides - Optional per-SMS merchant moves
 */
export function pushedExpensesForMerchant(
    events: Array<FinancialEvent & { body?: string }>,
    key: string,
    parser = new FinancialParser(),
    overrides?: ReadonlyMap<number, SmsSpendOverride>
): FinancialEvent[] {
    return events.filter((event) => {
        if (event.kind !== "expense" || !event.fireflyTransactionId) {
            return false;
        }

        return eventCatalogKey(event, parser, overrides?.get(event.smsId)) === key;
    });
}

/**
 * Catalog key for a pushed expense after a per-SMS merchant move.
 *
 * @param event - Posted financial event
 * @param parser - SMS merchant extract for blank stored merchants
 * @param override - Optional merchant move
 */
export function eventCatalogKey(
    event: FinancialEvent & { body?: string },
    parser = new FinancialParser(),
    override?: Pick<SmsSpendOverride, "merchantKey"> | null
): string {
    if (override?.merchantKey) {
        return override.merchantKey;
    }

    const merchant = event.merchant || parser.extractMerchantFromBody(event.body ?? "");
    return merchantCatalogKey(merchant);
}

/**
 * PUTs `category_name` on Dhan journals for one merchant catalog key.
 *
 * @param client - Authenticated Firefly client
 * @param events - Pushed expense rows
 * @param key - Catalog id
 * @param categoryName - Firefly category label
 * @param cap - Max updates this call
 * @param overrides - Optional per-SMS merchant moves
 * @param bucketLabels - Labels for user-created buckets
 */
export async function applyMerchantCategoryToDhan(
    client: FireflyClient,
    events: Array<FinancialEvent & { body?: string }>,
    key: string,
    categoryName: string,
    cap = DHAN_RECATEGORIZE_CAP,
    overrides?: ReadonlyMap<number, SmsSpendOverride>,
    bucketLabels?: ReadonlyMap<string, string>
): Promise<DhanRecategorizeStats> {
    const parser = new FinancialParser();
    const matched = pushedExpensesForMerchant(events, key, parser, overrides);
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

        const overrideCategory = overrides?.get(event.smsId)?.category;
        const name = overrideCategory
            ? spendBucketLabel(overrideCategory, bucketLabels)
            : categoryName;

        try {
            await client.updateTransactionCategory(id, name);
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
 * @param overrides - Optional per-SMS category / merchant moves
 * @param bucketLabels - Labels for user-created buckets
 */
export async function applyAssignedCategoriesToDhan(
    client: FireflyClient,
    events: Array<FinancialEvent & { body?: string }>,
    work: Array<{ key: string; categoryName: string }>,
    cap = DHAN_RECATEGORIZE_CAP,
    overrides?: ReadonlyMap<number, SmsSpendOverride>,
    bucketLabels?: ReadonlyMap<string, string>
): Promise<DhanRecategorizeStats> {
    const parser = new FinancialParser();
    const byKey = new Map(work.map((row) => [row.key, row.categoryName]));
    const jobs = events.flatMap((event) => {
        if (event.kind !== "expense" || !event.fireflyTransactionId) {
            return [];
        }

        const override = overrides?.get(event.smsId);
        const key = eventCatalogKey(event, parser, override);
        const categoryName = override?.category
            ? spendBucketLabel(override.category, bucketLabels)
            : byKey.get(key);

        return categoryName ? [{ event, categoryName }] : [];
    });
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

/**
 * PUTs `category_name` on one already-pushed Dhan journal.
 *
 * @param client - Authenticated Firefly client
 * @param fireflyTransactionId - Stored journal id
 * @param category - Spend bucket
 * @param bucketLabels - Labels for user-created buckets
 */
export async function applySmsCategoryToDhan(
    client: FireflyClient,
    fireflyTransactionId: string,
    category: SpendBucket,
    bucketLabels?: ReadonlyMap<string, string>
): Promise<DhanRecategorizeStats> {
    const stats: DhanRecategorizeStats = {
        matched: 1,
        updated: 0,
        failed: 0,
        remaining: 0,
        errors: [],
    };

    try {
        await client.updateTransactionCategory(
            fireflyTransactionId,
            spendBucketLabel(category, bucketLabels)
        );
        stats.updated = 1;
    } catch (error) {
        stats.failed = 1;
        stats.errors.push(error instanceof Error ? error.message : "update failed");
    }

    return stats;
}
