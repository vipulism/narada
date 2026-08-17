import dotenv from "dotenv";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import { loadDhanSeedFile, planFireflyAccountSeed } from "../../connectors/firefly/firefly.seed";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const seed = loadDhanSeedFile();
    const client = loadFireflyClient();
    const existing = await client.listLedgerAccounts();
    const rows = planFireflyAccountSeed(seed.accounts, existing, seed.openOn);

    let created = 0;
    let skipped = 0;
    let invalid = 0;
    let failed = 0;

    console.log(`Dhan account seed openOn=${seed.openOn} apply=${apply}`);

    for (const row of rows) {
        if (row.action === "invalid") {
            invalid += 1;
            console.error(`invalid ${row.name}: ${row.reason}`);
            continue;
        }

        if (row.action === "skip") {
            skipped += 1;
            console.log(`skip ${row.name}: ${row.reason}`);
            continue;
        }

        const label = `${row.plan.name} last4=${row.plan.accountNumber} ₹${row.plan.openingBalance}`;

        if (!apply) {
            console.log(`create ${label}`);
            created += 1;
            continue;
        }

        try {
            const id = await client.createAccount(row.plan);
            created += 1;
            console.log(`created ${label} firefly=${id}`);
        } catch (error) {
            failed += 1;
            console.error(
                `failed ${row.plan.name}: ${error instanceof Error ? error.message : error}`
            );
        }
    }

    console.log(
        `Firefly accounts: create=${created} skip=${skipped} invalid=${invalid} failed=${failed}`
    );

    if (!apply && created > 0) {
        console.log("Dry-run only. Re-run with --apply to POST.");
    }

    if (invalid > 0 || failed > 0) {
        process.exit(1);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
