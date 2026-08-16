import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { ClassifierRunner } from "../../classifiers/classifier.runner";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    await connectDb();

    const runner = new ClassifierRunner();
    const results = await runner.run();

    for (const result of results) {
        console.log(
            `${result.classifier}: processed=${result.processed} classified=${result.classified} skipped=${result.skipped}`
        );
    }

    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
