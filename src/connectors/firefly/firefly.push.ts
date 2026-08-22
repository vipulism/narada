import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { MerchantCategoryRepository } from "../../db/repositories/merchantCategory.repository";
import { loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { FireflyLast4Index } from "./firefly.accountMap";
import { FireflyClient } from "./firefly.client";
import { planFireflyTransaction } from "./firefly.dryRun";
import { loadFireflyOpenings } from "./firefly.openings";

/**
 * Counts from one Firefly push pass.
 */
export interface FireflyPushStats {
    posted: number;
    alreadyPushed: number;
    skippedOpening: number;
    blocked: number;
    failed: number;
}

/**
 * POSTs planned events that are after the ledger opening and not already pushed.
 *
 * @param client - Authenticated Firefly client
 */
export async function pushReadyFireflyTransactions(
    client: FireflyClient
): Promise<FireflyPushStats> {
    const owned = loadKnownAccountIndex();
    const openings = loadFireflyOpenings(owned.all().map((account) => account.last4));
    const firefly = new FireflyLast4Index(await client.listLedgerAccounts());
    const repository = new FinancialEventRepository();
    const assigned = await new MerchantCategoryRepository().listBucketMap();
    const events = await repository.listAll();
    const stats: FireflyPushStats = {
        posted: 0,
        alreadyPushed: 0,
        skippedOpening: 0,
        blocked: 0,
        failed: 0,
    };

    for (const event of events) {
        if (event.fireflyTransactionId) {
            stats.alreadyPushed += 1;
            continue;
        }

        const row = planFireflyTransaction(event, firefly, owned, openings, assigned);

        if (!row.ok) {
            if (row.skip) {
                stats.skippedOpening += 1;
            } else {
                stats.blocked += 1;
                console.error(`blocked #${row.smsId}: ${row.reason}`);
            }

            continue;
        }

        try {
            const id = await client.createTransaction(row.plan);
            await repository.markPushed(event.smsId, id);
            stats.posted += 1;
            console.log(
                `posted #${row.plan.smsId} ${row.plan.type} ₹${row.plan.amount} ${row.plan.date} firefly=${id}`
            );
        } catch (error) {
            stats.failed += 1;
            console.error(
                `failed #${row.plan.smsId}: ${error instanceof Error ? error.message : error}`
            );
        }
    }

    return stats;
}
