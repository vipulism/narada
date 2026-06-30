import cron from "node-cron";
import { FolderConnector } from "../connectors/folder/folder.connector";
import { SmsImportService } from "../importers/sms/smsImport.service";


export async function startImportScheduler(): Promise<void> {
  console.info("📂 Starting Import Scheduler...");

  const smsFolderConnector = await new FolderConnector(
    {
      name: "SMS Imports",
      path: "/imports/sms",
      pattern: /\.xml$/,
    },
    new SmsImportService()
  );
  

  // Run once on startup
  await smsFolderConnector.scan();

  // Then every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    await smsFolderConnector.scan();
  });

  console.info("📂 Import Scheduler started (every 10 minutes)");
}