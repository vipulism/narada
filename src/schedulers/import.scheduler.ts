import cron from "node-cron";
import { FolderConnector } from "../connectors/folder/folder.connector";
import { SmsImportService } from "../importers/sms/smsImport.service";
import { runSmsLedgerFollowUp } from "../importers/sms/smsLedger.followUp";

/**
 * Watches the Syncthing SMS folder, then classify → events → Firefly.
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

    console.info("📂 Import Scheduler started (every 10 minutes)");
}

async function ingestSms(smsFolderConnector: FolderConnector): Promise<void> {
    try {
        await smsFolderConnector.scan();
        await runSmsLedgerFollowUp();
    } catch (error) {
        console.error("SMS ingest failed", error);
    }
}
