import { ClassifierRunner } from "../../classifiers/classifier.runner";
import { FinancialEventNormalizer } from "../../classifiers/financial/financial.normalizer";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import { pushReadyFireflyTransactions } from "../../connectors/firefly/firefly.push";

/**
 * After new SMS XML is imported: classify pending rows, rebuild events, push to Dhan.
 */
export async function runSmsLedgerFollowUp(): Promise<void> {
    const results = await new ClassifierRunner().run();
    const classified = results.reduce((sum, result) => sum + result.classified, 0);

    if (classified === 0) {
        return;
    }

    const events = await new FinancialEventNormalizer().rebuildFromAnalysis();
    console.info(
        `financial_events rebuilt: stored=${events.stored} considered=${events.considered}`
    );

    if (!process.env.FIREFLY_TOKEN?.trim() || !process.env.FIREFLY_URL?.trim()) {
        console.info("Skip Firefly push: FIREFLY_URL or FIREFLY_TOKEN missing");
        return;
    }

    const stats = await pushReadyFireflyTransactions(loadFireflyClient());
    console.info(
        `Firefly push: posted=${stats.posted} already=${stats.alreadyPushed} skipped=${stats.skippedOpening} blocked=${stats.blocked} failed=${stats.failed}`
    );

    if (stats.failed > 0) {
        throw new Error(`Firefly push failed for ${stats.failed} event(s)`);
    }
}
