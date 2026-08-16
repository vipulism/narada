import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { migrate } from "../../db/migrate";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import { pushReadyFireflyTransactions } from "../../connectors/firefly/firefly.push";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    await connectDb();
    await migrate();

    const stats = await pushReadyFireflyTransactions(loadFireflyClient());

    console.log(
        `Firefly push: posted=${stats.posted} already=${stats.alreadyPushed} skipped=${stats.skippedOpening} blocked=${stats.blocked} failed=${stats.failed}`
    );

    if (stats.failed > 0) {
        process.exit(1);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
