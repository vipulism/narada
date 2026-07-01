import { connectDb } from "../../db/mariaConnection";
import { printReport } from "./report";
import { SmsAudit } from "./smsAudit";
import "dotenv/config";


async function main() {

    await connectDb();

    const audit = new SmsAudit();
    const report = await audit.run();
    printReport(report);
}

main().catch((error) => {

    console.error(error);

    process.exit(1);

});