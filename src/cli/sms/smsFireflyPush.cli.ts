import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { migrate } from "../../db/migrate";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import { FireflyLast4Index } from "../../connectors/firefly/firefly.accountMap";
import { planFireflyTransaction } from "../../connectors/firefly/firefly.dryRun";
import { loadFireflyOpenings } from "../../connectors/firefly/firefly.openings";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    await connectDb();
    await migrate();

    const client = loadFireflyClient();
    const owned = loadKnownAccountIndex();
    const openings = loadFireflyOpenings(owned.all().map((account) => account.last4));
    const firefly = new FireflyLast4Index(await client.listLedgerAccounts());
    const repository = new FinancialEventRepository();
    const events = await repository.listAll();

    let posted = 0;
    let skippedOpening = 0;
    let alreadyPushed = 0;
    let blocked = 0;
    let failed = 0;

    for (const event of events) {
        if (event.fireflyTransactionId) {
            alreadyPushed += 1;
            continue;
        }

        const row = planFireflyTransaction(event, firefly, owned, openings);

        if (!row.ok) {
            if (row.skip) {
                skippedOpening += 1;
            } else {
                blocked += 1;
                console.error(`blocked #${row.smsId}: ${row.reason}`);
            }

            continue;
        }

        try {
            const id = await client.createTransaction(row.plan);
            await repository.markPushed(event.smsId, id);
            posted += 1;
            console.log(
                `posted #${row.plan.smsId} ${row.plan.type} ₹${row.plan.amount} ${row.plan.date} firefly=${id}`
            );
        } catch (error) {
            failed += 1;
            console.error(
                `failed #${row.plan.smsId}: ${error instanceof Error ? error.message : error}`
            );
        }
    }

    console.log(
        `Firefly push: posted=${posted} already=${alreadyPushed} skipped=${skippedOpening} blocked=${blocked} failed=${failed}`
    );

    if (failed > 0) {
        process.exit(1);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
