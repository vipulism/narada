import { SmsClassifier } from "../classifier";
import {
  SmsAnalysis,
  SmsCategory,
  SmsMessage,
} from "../../importers/sms/sms.model";
import { senderNormalize } from "../common/senderNormalizer";
import { FinancialParser } from "./financial.parser";
import { FinancialFacts } from "./financial.model";
import { detectFinancialKind, isSkippedFinancialNoise } from "./financial.kind";

/**
 * Detects financial SMS and extracts structured facts via regex parsing.
 */
export class FinancialClassifier implements SmsClassifier {
  public readonly name = "regex-financial";
  public readonly version = "1.3.24";

  private readonly parser = new FinancialParser();

  /**
   * Common bank, card, and specialist sender IDs.
   * This list will grow over time.
   */
  private readonly FINANCIAL_SENDERS = [
    "HDFCBK",
    "ICICIT",
    "ICICIB",
    "YESBNK",
    "RBLBNK",
    "RBLCRD",
    "AXISBK",
    "AXMAXT",
    "OLAMNY",
    "OLACAB",
    "SBIINB",
    "SBIBNK",
    "SBICRD",
    "CBSSBI",
    "HSBCBK",
    "HSBC",
    "HSBCIM",
    "TATANE",
    "TATANEU",
    "SCAPIA",
    "INDUSB",
    "INDUSIND",
    "IDFCFB",
    "IDFCFR",
    "PHONEPE",
    "PHONPE",
    "PAYTM",
    "GPAY",
    "PAYZAP",
    "CRED",
    "IGLMKT",
    "PPFAMF",
    "IPRUMF",
    "AXISMF",
    "PARKPL",
    "EPFOHO",
    "EPFO",
    "DOMINO",
  ];

  /**
   * Returns a confidence score for whether the message is financial.
   *
   * @param message - SMS to evaluate
   * @returns 1 for known senders, 0.8 for keyword matches, otherwise 0
   */
  supports(message: SmsMessage): number {
    if (isSkippedFinancialNoise(message)) {
      return 0;
    }

    const senderinfo = senderNormalize(message.address);

    if (this.FINANCIAL_SENDERS.some((bank) => senderinfo.sender.includes(bank))) {
      return 1;
    }

    const body = message.body.toUpperCase();

    if (this.hasFinancialKeywords(body)) {
      return 0.8;
    }

    return 0;
  }

  private hasFinancialKeywords(body: string): boolean {
    const KEYWORDS = [
      "DEBITED",
      "CREDITED",
      "SPENT",
      "UPI",
      "ACCOUNT",
      "AVAILABLE BALANCE",
      "E-STATEMENT",
      "E-STMT",
      "FOLIO",
      "MONEY TRANSFERRED",
      "MONEY RECEIVED",
      "TRANSFERRED TO",
      "AMOUNT PAID",
      "DEBIT BY TRANSFER",
    ];

    return KEYWORDS.some((keyword) => body.includes(keyword));
  }

  /**
   * Classifies the message and extracts financial facts when supported.
   * Skip templates and non-matches are stored as UNKNOWN.
   *
   * @param message - SMS to classify
   * @returns Analysis row for every message
   */
  classify(message: SmsMessage): SmsAnalysis {
    const score = this.supports(message);

    if (score === 0) {
      return {
        category: SmsCategory.UNKNOWN,
        subcategory: "UNKNOWN",
        confidence: score,
        classifier: this.name,
        classifierVersion: this.version,
        classifiedAt: new Date(),
        extractedData: {},
      };
    }

    const facts = this.parser.parse(message);
    const kind = detectFinancialKind(message, facts);

    return {
      category: SmsCategory.FINANCIAL,
      subcategory: kind,
      confidence: score,
      classifier: this.name,
      classifierVersion: this.version,
      classifiedAt: new Date(),
      extractedData: this.toExtractedData(facts),
    };
  }

  private toExtractedData(facts: FinancialFacts): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(facts).filter(([, value]) => value !== undefined)
    );
  }
}
