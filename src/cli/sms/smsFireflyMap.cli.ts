import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { migrate } from "../../db/migrate";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import {
    extraFireflyAccounts,
    extractFireflyAccountLast4,
    FireflyLast4Index,
    mapOwnedToFirefly,
} from "../../connectors/firefly/firefly.accountMap";
import { planFireflyTransaction } from "../../connectors/firefly/firefly.dryRun";
import { loadFireflyOpenings } from "../../connectors/firefly/firefly.openings";
import { FireflyDryRunRow } from "../../connectors/firefly/firefly.types";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    await connectDb();
    await migrate();

    const client = loadFireflyClient();
    const owned = loadKnownAccountIndex();
    const fireflyAccounts = await client.listLedgerAccounts();
    const firefly = new FireflyLast4Index(fireflyAccounts);
    const ownedRows = mapOwnedToFirefly(owned.all(), firefly);
    const extras = extraFireflyAccounts(
        fireflyAccounts,
        new Set(owned.all().map((account) => account.last4))
    );

    console.log(`Firefly ledger accounts: ${fireflyAccounts.length}`);
    console.log("\nNarada last4 → Firefly");

    for (const row of ownedRows) {
        const last4 = row.owned.last4;
        const local = `${row.owned.name} (${last4})`;

        if (row.status === "mapped" && row.firefly) {
            console.log(
                `  mapped   ${local} → id=${row.firefly.id} ${row.firefly.name} [${row.firefly.type}]`
            );
            continue;
        }

        if (row.status === "conflict") {
            console.log(`  conflict ${local} — duplicate last4 in Firefly`);
            continue;
        }

        console.log(`  missing  ${local}`);
    }

    if (extras.length > 0) {
        console.log("\nFirefly extras (no Narada last4)");
        for (const account of extras) {
            const last4 = extractFireflyAccountLast4(account.accountNumber) ?? "-";
            console.log(
                `  id=${account.id} ${account.name} last4=${last4} [${account.type}]`
            );
        }
    }

    const openings = loadFireflyOpenings(owned.all().map((account) => account.last4));
    const events = await new FinancialEventRepository().listAll();
    const rows = events.map((event) =>
        planFireflyTransaction(event, firefly, owned, openings)
    );
    const ready = rows.filter((row) => row.ok);
    const skipped = rows.filter((row) => !row.ok && row.skip);
    const blocked = rows.filter((row) => !row.ok && !row.skip);

    const byType = new Map<string, number>();

    for (const row of ready) {
        if (!row.ok) {
            continue;
        }

        byType.set(row.plan.type, (byType.get(row.plan.type) ?? 0) + 1);
    }

    console.log(`\nDry-run events: ${events.length}`);
    console.log(`  ready: ${ready.length}`);
    console.log(`  skipped: ${skipped.length} (before Firefly opening)`);
    console.log(`  blocked: ${blocked.length}`);
    for (const [type, n] of [...byType.entries()].sort((left, right) => right[1] - left[1])) {
        console.log(`  ${type}: ${n}`);
    }

    printBlockedReasons("Skipped reasons", skipped);
    printBlockedReasons("Blocked reasons", blocked);
    printSamples(ready);

    process.exit(0);
}

function printBlockedReasons(title: string, blocked: FireflyDryRunRow[]): void {
    if (blocked.length === 0) {
        return;
    }

    const counts = new Map<string, number>();

    for (const row of blocked) {
        if (row.ok) {
            continue;
        }

        counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
    }

    console.log(`\n${title}`);
    for (const [reason, n] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
        console.log(`  ${n}\t${reason}`);
    }
}

function printSamples(ready: FireflyDryRunRow[]): void {
    const samples: Array<{ type: string; row: FireflyDryRunRow }> = [];

    for (const type of ["withdrawal", "deposit", "transfer"]) {
        const match = ready.find((row) => row.ok && row.plan.type === type);

        if (match) {
            samples.push({ type, row: match });
        }
    }

    if (samples.length === 0) {
        return;
    }

    console.log("\nSample payloads (not posted)");
    for (const sample of samples) {
        if (!sample.row.ok) {
            continue;
        }

        const plan = sample.row.plan;
        console.log(
            `  ${plan.type} #${plan.smsId} ${plan.date} ₹${plan.amount} ${plan.description}`
        );
        console.log(
            `    source=${plan.sourceId ?? plan.sourceName ?? "-"} dest=${plan.destinationId ?? plan.destinationName ?? "-"} external_id=${plan.externalId}`
        );
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
