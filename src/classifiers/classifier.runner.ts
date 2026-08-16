import { SmsAnalysisRepository } from "../importers/sms/smsAnalysis.repository";
import { SmsRepository } from "../importers/sms/sms.repository";
import { SmsCategory } from "../importers/sms/sms.model";
import { CLASSIFIERS } from "./classifier.registry";

/**
 * Per-classifier totals from a full pending drain.
 */
export interface ClassificationResult {
    classifier: string;
    processed: number;
    classified: number;
    skipped: number;
}

/**
 * Runs registered SMS classifiers against messages that have no analysis yet.
 */
export class ClassifierRunner {

    private readonly smsRepository = new SmsRepository();
    private readonly analysisRepository = new SmsAnalysisRepository();

    private static readonly BATCH_SIZE = 100;

    /**
     * Drains every pending SMS for each registered classifier.
     *
     * @returns Totals per classifier
     */
    async run(): Promise<ClassificationResult[]> {

        const results: ClassificationResult[] = [];

        for (const classifier of CLASSIFIERS) {

            console.log(`🧠 Running classifier: ${classifier.name}@${classifier.version}`);

            let processed = 0;
            let classified = 0;

            while (true) {
                const messages =
                    await this.smsRepository.findPendingClassification(
                        classifier.name,
                        classifier.version,
                        ClassifierRunner.BATCH_SIZE
                    );

                if (messages.length === 0) {
                    break;
                }

                console.log(`📨 ${classifier.name}: ${messages.length} pending`);

                for (const message of messages) {
                    processed++;

                    const analysis = classifier.classify(message);
                    if (!analysis) {
                        continue;
                    }

                    await this.analysisRepository.save(
                        message.id,
                        analysis
                    );

                    if (analysis.category === SmsCategory.FINANCIAL) {
                        classified++;
                    }
                }
            }

            const result: ClassificationResult = {
                classifier: `${classifier.name}@${classifier.version}`,
                processed,
                classified,
                skipped: processed - classified,
            };

            console.log(`✅ ${result.classifier}: processed=${result.processed}, classified=${result.classified}, skipped=${result.skipped}`);

            results.push(result);
        }

        return results;
    }
}
