/**
 * Financial extraction regex library.
 *
 * NOTE:
 * - Regex should ONLY extract text.
 * - No business logic here.
 * - Parser decides what the match means.
 */

//
// Amount
//

/**
 * Matches:
 * INR 1234
 * INR.1234
 * INR 1,234.56
 */
export const INR_AMOUNT_REGEX =
    /INR\.?\s*((?:\d[\d,]*)?(?:\.\d{1,2})|\d[\d,]*)/i;

/**
 * Matches:
 * Rs 1234
 * Rs.1234
 * Rs. 1,234.56
 */
export const RS_AMOUNT_REGEX =
    /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i;

/**
 * Matches:
 * ₹1234
 * ₹ 1,234.56
 */
export const RUPEE_SYMBOL_AMOUNT_REGEX =
    /₹\s*([\d,]+(?:\.\d{1,2})?)/i;

//
// Available Balance
//

/**
 * Matches:
 * Avl Bal INR 1234
 * Avl Bal-INR 1234
 */
export const AVAILABLE_BALANCE_REGEX =
    /Av(?:ailable)?\s+Bal(?:ance)?[-:\s]*INR\.?\s*([\d,]+(?:\.\d{1,2})?)/i;

//
// Account
//

/**
 * Matches:
 * A/c XXXXX0592
 * Ac XXXXX0592
 */
export const ACCOUNT_REGEX =
    /A\/?c\s*([Xx*]*\d{4,})/i;

/**
 * Matches:
 * ending 0141
 * ending with 7111
 */
export const CARD_LAST4_REGEX =
    /ending(?:\s+with)?\s+(\d{4})/i;

/**
 * Matches:
 * card xx1260
 * card ending xx1260
 * a/c xx0592
 * ac xxxx1234
 */
export const CARD_MASKED_LAST4_REGEX =
    /(?:card|a\/?c|ac)\s+(?:ending\s+)?(?:x{2,}|\*{2,})-?(\d{3,})\b/i;

/**
 * Matches:
 * xxxx1234
 * ****1234
 * xx1234
 */
export const MASKED_LAST4_REGEX =
    /(?:x{2,}|\*{2,})-?(\d{3,})\b/i;

/**
 * Matches:
 * Card 1687
 * CC 3671
 */
export const CARD_BARE_LAST4_REGEX =
    /(?:card|cc)\s+(\d{4})\b/i;

/**
 * Matches 3–4 visible digits after a mask:
 * Acct XX412
 * Acc XX412
 * A/C *1260
 */
export const ACCT_MASKED_DIGITS_REGEX =
    /(?:acct|account|acc|a\/?c|card|loan)\s+(?:x{1,}|\*+)-?(\d{3,})\b/i;

/**
 * Matches:
 * FASTag 5940
 * Fastag 5940
 */
export const FASTAG_LAST4_REGEX =
    /fastag\s+(\d{4})\b/i;

/**
 * Matches:
 * Tag 3XXX5940
 * Tag XXXX5940
 */
export const FASTAG_TAG_LAST4_REGEX =
    /tag\s+\d?x{2,4}(\d{4})\b/i;

/**
 * Matches:
 * credit card (7111)
 * card (1687)
 */
export const CARD_PAREN_LAST4_REGEX =
    /(?:card|cc)\s*\((\d{4})\)/i;

//
// Cash Flow Keywords
//

export const CREDIT_KEYWORDS = [
    "HAS BEEN CREDITED",
    "RECEIVED FROM",
    "CREDITED",
    "RECEIVED",
    "DEPOSITED",
    "REFUND",
    "CASHBACK",
    "REVERSAL",
    "REVERSED",
    "CR ",
];

export const DEBIT_KEYWORDS = [
    "HAS BEEN DEBITED",
    "DEBITED FROM",
    "WITHDRAWN FROM",
    "TRANSACTION OF",
    "TXN OF",
    "TXN RS",
    "TXN INR",
    "AMT SENT",
    "AMOUNT SENT",
    "SENT RS",
    "AUTOPAY (E-MANDATE) SUCCESS",
    "CURRENT TXN AMT",
    "SENT TO",
    "USED AT",
    "DEBITED",
    "SPENT",
    "PAID",
    "PURCHASE",
    "WITHDRAWN",
    "DR ",
];

//
// Transaction Keywords
//

export const UPI_REGEX = /\bUPI\b/i;
export const BBPS_REGEX = /\bBBPS\b/i;
export const NEFT_REGEX = /\bNEFT\b/i;
export const IMPS_REGEX = /\bIMPS\b/i;
export const RTGS_REGEX = /\bRTGS\b/i;
export const ATM_REGEX = /\bATM\b/i;

//
// Merchant
//

/**
 * Examples:
 * at AMAZON
 * at PAYTM
 * at JABONG
 */
export const MERCHANT_AT_REGEX =
    /\bat\s+([A-Z0-9*.\-_& ]+?)(?:\s*\([^)]*\))?(?=\s+on|\s+for\s+(?:INR|RS)|$)/i;

/**
 * Example:
 * to UBER
 * To PWC_IRCTC_UPI
 */
export const MERCHANT_TO_REGEX =
    /\bto\s+([A-Z0-9*.\-_& ]+?)(?=\s+on|\s+from\b|\s+at\s+(?:\d|[A-Za-z]{3})|\s*$)/i;

//
// Transaction date (body only)
//

/**
 * Matches:
 * on 15-Aug-26
 * on 15/08/2026
 * on 15-08-26
 */
export const TRANSACTION_DATE_REGEX =
    /\bon\s+(\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4})/i;

/**
 * Matches:
 * Payment due on 20-Jan-23
 * due by 30-NOV-21
 * Payable by 27/08/2026
 * to be paid by 30-Nov-24
 */
export const DUE_DATE_REGEX =
    /(?:payment\s+due\s+on|is\s+due\s+on|due\s+by|to\s+be\s+paid\s+by|payable\s+by|pay\s+by|due\s+date)\s+(\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4})/i;

/**
 * Matches:
 * Payment Due Date: 05/01/23
 * Payment Due Date 05-01-2023
 */
export const PAYMENT_DUE_DATE_REGEX =
    /payment\s+due\s+date[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i;

/**
 * Matches:
 * Due on 25th Aug 2021
 */
export const DUE_ON_ORDINAL_REGEX =
    /due\s+(?:on|by)\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{2,4})/i;

/**
 * Matches EPF passbook corpus:
 * passbook balance ... is Rs. 111415
 */
export const EPF_BALANCE_REGEX =
    /passbook\s+balance[^\d]*Rs\.?\s*([\d,]+)/i;
