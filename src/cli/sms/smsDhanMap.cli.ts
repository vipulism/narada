import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { FinancialEvent } from "../../classifiers/financial/financial.model";
import { KnownAccount } from "../../classifiers/financial/knownAccount.model";
import { loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import {
    DhanMapBucket,
    resolveDhanAccount,
    resolveDhanCounterparty,
} from "../../classifiers/financial/financial.dhanMap";

dotenv.config({ path: ".env.local" });
dotenv.config();

type MapBucket = DhanMapBucket;

interface MappedRow {
    event: FinancialEvent;
    bucket: MapBucket;
    account?: KnownAccount;
    counterparty?: KnownAccount;
}

async function main(): Promise<void> {
    await connectDb();

    const accounts = loadKnownAccountIndex();
    const events = await new FinancialEventRepository().listAll();
    const rows: MappedRow[] = events.map((event) => ({
        event,
        ...resolveDhanAccount(event, accounts),
        counterparty: resolveDhanCounterparty(event, accounts).account,
    }));

    const mapped = rows.filter((row) => row.bucket === "mapped");
    const uniqueBank = rows.filter((row) => row.bucket === "unique-bank");
    const unmapped = rows.filter((row) => row.bucket === "unmapped");
    const transfers = rows.filter((row) => row.event.kind === "transfer");
    const loanPayments = transfers.filter((row) => row.counterparty?.type === "loan");
    const assetTransfers = transfers.filter((row) => row.counterparty?.type !== "loan");
    const transferGap = transfers.filter(
        (row) => !row.event.counterpartyLast4 || !row.counterparty
    );

    console.log(`financial_events: ${events.length}`);
    console.log(`mapped: ${mapped.length}`);
    console.log(`unique-bank: ${uniqueBank.length}`);
    console.log(`unmapped: ${unmapped.length}`);
    console.log(`transfers: ${transfers.length}`);
    console.log(`  asset→asset: ${assetTransfers.length}`);
    console.log(`  savings→loan: ${loanPayments.length} (liability down, no savings credit)`);
    console.log(`transfer-gap: ${transferGap.length} (missing or unmapped counterparty_last4)`);

    printByAccount(mapped, uniqueBank);
    printTransferRoutes(transfers);

    console.log("\nUnmapped samples (up to 15)");
    for (const row of unmapped.slice(0, 15)) {
        console.log(`  ${formatRow(row)}`);
    }

    if (transferGap.length > 0) {
        console.log("\nTransfer-gap samples (up to 5)");
        for (const row of transferGap.slice(0, 5)) {
            console.log(`  ${formatRow(row)}`);
        }
    }

    process.exit(0);
}

function printByAccount(mapped: MappedRow[], uniqueBank: MappedRow[]): void {
    const counts = new Map<string, number>();

    for (const row of [...mapped, ...uniqueBank]) {
        const label = row.account
            ? `${row.account.name} (${row.account.last4})`
            : "unknown";
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    if (counts.size === 0) {
        return;
    }

    console.log("\nBy owned account");
    for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n}\t${label}`);
    }
}

function printTransferRoutes(transfers: MappedRow[]): void {
    if (transfers.length === 0) {
        return;
    }

    const counts = new Map<string, number>();

    for (const row of transfers) {
        const from = row.account
            ? `${row.account.name} ${row.account.last4}`
            : row.event.accountLast4 ?? "-";
        const to = row.counterparty
            ? `${row.counterparty.name} ${row.counterparty.last4}`
            : row.event.counterpartyLast4 ?? "-";
        const kind = row.counterparty?.type === "loan" ? "loan" : "asset";
        const label = `${from} → ${to} (${kind})`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    console.log("\nTransfer routes");
    for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n}\t${label}`);
    }
}

function formatRow(row: MappedRow): string {
    const event = row.event;
    const source = row.account ? `${row.account.name} ${row.account.last4}` : "-";
    const dest = row.counterparty
        ? `${row.counterparty.name} ${row.counterparty.last4}`
        : event.counterpartyLast4 ?? "-";

    return [
        `#${event.smsId}`,
        event.kind,
        String(event.amount),
        event.accountLast4 ?? "-",
        "→",
        event.counterpartyLast4 ?? "-",
        source,
        "→",
        dest,
    ].join(" ");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
