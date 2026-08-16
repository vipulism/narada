import dotenv from "dotenv";
import { connectDb } from "../../db/mariaConnection";
import { migrate } from "../../db/migrate";
import { FinancialEventNormalizer } from "../../classifiers/financial/financial.normalizer";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { FinancialClassifier } from "../../classifiers/financial/financial.classifier";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main(): Promise<void> {
    await connectDb();
    await migrate();

    const classifier = new FinancialClassifier();
    console.log(`Rebuilding financial_events from ${classifier.name}@${classifier.version}`);

    const normalizer = new FinancialEventNormalizer();
    const result = await normalizer.rebuildFromAnalysis();
    const counts = await new FinancialEventRepository().countByKind();

    console.log(
        `financial_events: considered=${result.considered} stored=${result.stored}`
    );
    for (const row of counts) {
        console.log(`  ${row.kind}=${row.n}`);
    }

    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
