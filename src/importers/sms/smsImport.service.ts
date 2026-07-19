import { FinancialClassifier } from "../../classifiers/financial/financial.classifier";
import { FinancialParser } from "../../classifiers/financial/financial.parser";
import { SmsAnalysis, SmsCategory, SmsImportResult } from "./sms.model";
import { SmsRepository } from "./sms.repository";
import { SmsAnalysisRepository } from "./smsAnalysis.repository";
import { loadSmsXml } from "./smsXmlParser";



export class SmsImportService {

    constructor(
        private readonly repository = new SmsRepository()
      ) {}


      async import(filePath: string): Promise<SmsImportResult>{

        const started = Date.now();
        const parsedBackup =  await loadSmsXml(filePath);

    // Initialize classifiers and parser
    const classifier = new FinancialClassifier();
    const parser = new FinancialParser();

    // Process each SMS message
    const processedMessages = parsedBackup.messages.map(async (message) => {
      try {
        // Step 1: Classify the message
        const classification = await classifier.classify(message);

        if (classification && classification.category === SmsCategory.FINANCIAL) {
          // Step 2: Parse financial facts
          const facts = parser.parse(message);

          // Step 3: Prepare SmsAnalysis for storage
          const analysis: SmsAnalysis = {
            category: classification.category,
            subcategory: classification.subcategory,
            confidence: classification.confidence,
            classifier: classifier.name,
            classifierVersion: classifier.version,
            classifiedAt: new Date(),
            extractedData: facts as Record<string, unknown>,
          };

          // Step 4: Save the analysis
          await SmsAnalysisRepository.save(message.hash, analysis);
        }

        return message;
      } catch (error) {
        console.warn(`⚠️ Failed to classify or parse SMS: ${ (error as Error).message }`);
        return message;
      }
    });

    const processedMessagesResult = await Promise.all(processedMessages);


        const attempted = parsedBackup.messages.length;
        const hashes = parsedBackup.messages.map(sms => sms.hash);
        const existingHashes = await this.repository.findExistingHashes(hashes);
        const newMessages  = parsedBackup.messages.filter(sms => !existingHashes.has(sms.hash));

        const imported = await this.repository.insertMany(newMessages );

        console.info(
            `📥 Imported ${imported}/${attempted} SMS (${existingHashes.size} skipped)`
          );

        return {

            imported,
            attempted,
            skipped:existingHashes.size,
            sourceFile:filePath,
            durationMs: Date.now() - started

        }

      }
}