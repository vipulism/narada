import { SmsClassifier } from "../classifier";
import {
  SmsAnalysis,
  SmsCategory,
  SmsMessage,
} from "../../importers/sms/sms.model";
import { senderNormalize } from "../common/senderNormalizer";

export class FinancialClassifier implements SmsClassifier {
  public readonly name = "regex-financial";
  public readonly version = "1.0.0";

  /**
   * Common bank sender IDs.
   * This list will grow over time.
   */
  private readonly FINANCIAL_SENDERS =  [
    "HDFCBK",
    "ICICIT",
    "YESBNK",
    "RBLBNK",
    "PHONEPE",
    "PAYTM",
    "GPAY",
    "CRED",
  ];

  supports(message: SmsMessage): number {
    const senderinfo = senderNormalize(message.address);

    if (this.FINANCIAL_SENDERS.some((bank) => senderinfo.sender.includes(bank))) {
      return 1;
    }

    const body = message.body.toUpperCase();

    if ( this.hasFinancialKeywords(body)) {
      return 0.8;
    }

    return 0;
  }

  private hasFinancialKeywords(body: string): boolean {

    const KEYWORDS = [
        "DEBITED",
        "CREDITED",
        "UPI",
        "ACCOUNT",
        "AVAILABLE BALANCE"
    ];

    return KEYWORDS.some((keyword) => body.includes(keyword));
  }

  classify(message: SmsMessage): SmsAnalysis | null {
    const score = this.supports(message);

    if (score === 0) {
      return null;
    }

    return {
      category: SmsCategory.FINANCIAL,
      subcategory: "UNKNOWN",
      confidence: score,
      classifier: this.name,
      classifierVersion: this.version,
      classifiedAt: new Date(),
      extractedData: {},
    };
  }

  /*
TODO

✓ Detect Financial SMS

Next:

- Amount
- CashFlow
- Currency
- Merchant
- Balance
- Transaction Type
- Due Date
- Policy Number
*/

}

