import { FinancialParser } from "./financial.parser";
import { FinancialFacts } from "./financial.model";
import { SmsAnalysis, SmsMessage } from "../../importers/sms/sms.model";
import { SmsExtractionRepository } from "../repositories/smsExtraction.repository";
import { FinancialClassifier } from "./financial.classifier";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";

export class FinancialEventNormalizer {
  private parser: FinancialParser;
  private repository: FinancialEventRepository;

  constructor() {
    this.parser = new FinancialParser();
    this.repository = new FinancialEventRepository();
  }

  async normalizeAndStore(message: SmsMessage): Promise<void> {
    const analysis = this.classifyMessage(message);
    if (!analysis) return;

    const facts = this.parser.parse(message);

    await this.repository.insert(facts);
  }

  private classifyMessage(message: SmsMessage): SmsAnalysis | null {
    const classifier = new FinancialClassifier();
    return classifier.classify(message);
  }

 
}