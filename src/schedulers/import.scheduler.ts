import cron from "node-cron";
import { FolderConnector } from "../connectors/folder/folder.connector";
import { SmsImportService } from "../importers/sms/smsImport.service";
import { runAttentionAlerts, runDailyAttentionDigest } from "../notifiers/attention.alerts";
import { runSmsLedgerFollowUp } from "../importers/sms/smsLedger.followUp";

/**
 * Watches the Syncthing SMS folder, then classify → events → Firefly.
 * Also sends the 08:00 IST unpaid-dues + Dhan month-stats Telegram digest.
 *
 * @returns Resolves when the first scan is scheduled
 */
export async function startImportScheduler(): Promise<void> {
    console.info("📂 Starting Import Scheduler...");

    const smsFolderConnector = new FolderConnector(
        {
            name: "SMS Imports",
            path: "/imports/sms",
            pattern: /\.xml$/,
        },
        new SmsImportService()
    );

    await ingestSms(smsFolderConnector);

    cron.schedule("*/10 * * * *", async () => {
        await ingestSms(smsFolderConnector);
    });

    cron.schedule(
        "0 8 * * *",
        async () => {
            await runDailyAttentionDigest();
        },
        { timezone: "Asia/Kolkata" }
    );

    console.info("📂 Import Scheduler started (every 10 minutes; daily digest 08:00 IST)");
}

async function ingestSms(smsFolderConnector: FolderConnector): Promise<void> {
    try {
        await smsFolderConnector.scan();
        await runSmsLedgerFollowUp();
        await runAttentionAlerts();
    } catch (error) {
        console.error("SMS ingest failed", error);
    }
}
