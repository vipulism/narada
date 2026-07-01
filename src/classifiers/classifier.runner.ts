import { SmsAnalysisRepository } from "../importers/sms/smsAnalysis.repository";
import { SmsRepository } from "../importers/sms/sms.repository";
import { CLASSIFIERS } from "./classifier.registry";

export interface ClassificationResult {
    classifier: string;
    processed: number;
    classified: number;
    skipped: number;
}

export class ClassifierRunner {

    private readonly smsRepository = new SmsRepository();
    private readonly analysisRepository = new SmsAnalysisRepository();

    private static readonly BATCH_SIZE = 100;

    async run(): Promise<ClassificationResult[]> {

        const results: ClassificationResult[] = [];

        for (const classifier of CLASSIFIERS) {

            console.log( `🧠 Running classifier: ${classifier.name}@${classifier.version}` );

            let processed = 0;
            let classified = 0;

                const messages =
                    await this.smsRepository.findPendingClassification(
                        classifier.name,
                        classifier.version,
                        ClassifierRunner.BATCH_SIZE
                    );

                if (messages.length === 0) { break; }

                console.log(`📨 ${classifier.name}: ${messages.length} pending`);

                for (const message of messages) {

                    processed++;
                    if (classifier.supports(message) === 0) { continue; }
                    const analysis = classifier.classify(message);
                    if (!analysis) { continue; }

                    await this.analysisRepository.save(
                        message.id,
                        analysis
                    );

                    classified++;
                }

            const result: ClassificationResult = {
                classifier: classifier.name,
                processed,
                classified,
                skipped: processed - classified,
            };

            console.log(`✅ ${result.classifier}: processed=${result.processed}, classified=${result.classified}, skipped=${result.skipped}` );

            results.push(result);
        }

        return results;
    }
}