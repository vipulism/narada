import { SmsAuditReport } from "./smsAudit.model";

export function printReport(report: SmsAuditReport): void {

    printHeader();

    printDataset(report);

    printDateRange(report);

    printSmsTypes(report);

    printTopSenders(report);

    printFooter();

}

function printHeader(): void {

    console.log();
    console.log("========================================");
    console.log("      Narada SMS Dataset Audit");
    console.log("========================================");
    console.log();

}

function printDataset(report: SmsAuditReport): void {

    console.log("📦 Dataset");
    console.log("----------------------------------------");
    console.log(
        `Total SMS         : ${report.dataset.totalSms.toLocaleString()}`
    );
    console.log(
        `Unique Senders    : ${report.dataset.uniqueSenders.toLocaleString()}`
    );
    console.log();

}

function printDateRange(report: SmsAuditReport): void {

    console.log("📅 Date Range");
    console.log("----------------------------------------");
    console.log(
        `First SMS         : ${formatDate(report.dateRange.firstSms)}`
    );
    console.log(
        `Last SMS          : ${formatDate(report.dateRange.lastSms)}`
    );
    console.log();

}

function printSmsTypes(report: SmsAuditReport): void {

    console.log("📨 SMS Types");
    console.log("----------------------------------------");

    for (const row of report.smsTypes) {

        console.log(
            `${smsTypeName(row.smsType).padEnd(15)} ${row.total.toLocaleString()}`
        );

    }

    console.log();

}

function printTopSenders(report: SmsAuditReport): void {

    console.log("🏦 Top Senders");
    console.log("----------------------------------------");

    report.topSenders.forEach((row, index) => {

        console.log(
            `${String(index + 1).padStart(2, " ")}. ${row.address.padEnd(25)} ${row.total.toLocaleString()}`
        );

    });

    console.log();

}

function printFooter(): void {

    console.log("✅ Audit Complete");
    console.log();

}

function smsTypeName(type: number): string {

    switch (type) {

        case 1:
            return "Inbox";

        case 2:
            return "Sent";

        default:
            return `Unknown (${type})`;

    }

}

function formatDate(date: Date): string {

    return date.toISOString().substring(0, 10);

}