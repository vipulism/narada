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
    /INR\.?\s*([\d,]+(?:\.\d{1,2})?)/i;

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

//
// Cash Flow Keywords
//

export const CREDIT_KEYWORDS = [
    "CREDITED",
    "RECEIVED",
    "DEPOSITED",
    "REFUND",
    "CASHBACK",
    "REVERSAL",
    "REVERSED"
];

export const DEBIT_KEYWORDS = [
    "DEBITED",
    "SPENT",
    "PAID",
    "PURCHASE",
    "WITHDRAWN"
];

//
// Transaction Keywords
//

export const UPI_REGEX = /\bUPI\b/i;
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
    /\bat\s+([A-Z0-9*.\-& ]+?)(?=\s+on|\s*$)/i;

/**
 * Example:
 * to UBER
 */
export const MERCHANT_TO_REGEX =
    /\bto\s+([A-Z0-9*.\-& ]+?)(?=\s+on|\s*$)/i;
