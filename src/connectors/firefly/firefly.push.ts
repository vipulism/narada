import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { MerchantCategoryRepository } from "../../db/repositories/merchantCategory.repository";
import { SmsSpendOverrideRepository } from "../../db/repositories/smsSpendOverride.repository";
import { MerchantAliasRepository } from "../../db/repositories/merchantAlias.repository";
import { SpendBucketRepository } from "../../db/repositories/spendBucket.repository";
import { loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { FireflyLast4Index } from "./firefly.accountMap";
import { FireflyClient } from "./firefly.client";
import {
    BILL_PAY_REWRITE_GET_LIMIT,
    orderFireflyPushEvents,
    planFireflyTransaction,
    shouldProbePostedBillPay,
    shouldRewritePostedBillPay,
} from "./firefly.dryRun";
import { loadFireflyOpenings } from "./firefly.openings";

/**
 * Counts from one Firefly push pass.
 */
export interface FireflyPushStats {
    posted: number;
    alreadyPushed: number;
    rewritten: number;
    rewriteFailed: number;
    skippedOpening: number;
    blocked: number;
    failed: number;
}

/**
 * POSTs planned events that are after the ledger opening and not already pushed.
 * Unpushed rows go first. Leftover pre-#122 bill-pay withdrawals get a capped
 * rewrite GET; those failures do not increment `failed`.
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
    const smsOverrideMap = await new SmsSpendOverrideRepository().listAll();
    const aliases = await new MerchantAliasRepository().listAll();
    const bucketLabels = await new SpendBucketRepository().labelMap();
    const events = orderFireflyPushEvents(await repository.listAll());
    const stats: FireflyPushStats = {
        posted: 0,
        alreadyPushed: 0,
        rewritten: 0,
        rewriteFailed: 0,
        skippedOpening: 0,
        blocked: 0,
        failed: 0,
    };
    let rewriteGets = 0;

    console.info(
        `Firefly push queue: unpushed=${events.filter((event) => !event.fireflyTransactionId).length} total=${events.length}`
    );

    for (const event of events) {
        const row = planFireflyTransaction(
            event,
            firefly,
            owned,
            openings,
            assigned,
            smsOverrideMap,
            aliases,
            bucketLabels
        );

        if (event.fireflyTransactionId) {
            stats.alreadyPushed += 1;

            if (
                rewriteGets < BILL_PAY_REWRITE_GET_LIMIT &&
                shouldProbePostedBillPay(event, row.ok)
            ) {
                rewriteGets += 1;

                try {
                    const currentType = await client.getTransactionType(event.fireflyTransactionId);

                    if (row.ok && shouldRewritePostedBillPay(event, currentType)) {
                        await client.updateTransaction(event.fireflyTransactionId, row.plan);
                        stats.rewritten += 1;
                        console.log(
                            `rewrote #${event.smsId} withdrawal→transfer ₹${row.plan.amount} ${row.plan.date} firefly=${event.fireflyTransactionId}`
                        );
                    }
                } catch (error) {
                    stats.rewriteFailed += 1;
                    console.error(
                        `rewrite #${event.smsId}: ${error instanceof Error ? error.message : error}`
                    );
                }
            }

            continue;
        }

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
