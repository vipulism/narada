import { SmsMessage } from "../../importers/sms/sms.model";
import { senderNormalize } from "../common/senderNormalizer";
import { CashFlow, FinancialFacts } from "./financial.model";
import { loadKnownAccountIndex } from "./knownAccounts";
import { KnownAccount } from "./knownAccount.model";

/**
 * Financial SMS kind used as sms_analysis.subcategory.
 */
export type FinancialKind =
    | "bill"
    | "investment"
    | "epf"
    | "expense"
    | "income"
    | "transfer"
    | "UNKNOWN";

/**
 * Returns true when the SMS is financial-looking noise (quota, OTP, promo).
 *
 * @param message - SMS to evaluate
 */
export function isSkippedFinancialNoise(message: SmsMessage): boolean {
    const body = message.body.toUpperCase();
    const sender = senderNormalize(message.address).sender;

    if (sender.includes("DOMINO") && !/AMOUNT\s*:?\s*RS/.test(body)) {
        return true;
    }

    if (body.includes("DATA QUOTA") || body.includes("HIGH SPEED DATA QUOTA")) {
        return true;
    }

    if (body.includes("UPI PIN")) {
        return true;
    }

    if (/ADDING YOUR .{0,60} UPI/.test(body)) {
        return true;
    }

    if (body.includes("ELIGIBLE FOR A LIMIT INCREASE")) {
        return true;
    }

    if (body.includes("OVERLIMIT FACILITY")) {
        return true;
    }

    if (/FREE\b.{0,40}GB DATA/.test(body)) {
        return true;
    }

    if (body.includes("CONVERTING PURCHASES TO EMI") || body.includes("CONVERTING PURCHASE TO EMI")) {
        return true;
    }

    if (body.includes("NIL FEE") || body.includes("BEST INTEREST RATE")) {
        return true;
    }

    if (body.includes("T&C") && body.includes("VALIDITY")) {
        return true;
    }

    if (
        body.includes("CASHBACK") &&
        (body.includes("NEXT 7 DAYS") ||
            body.includes("WE WILL DEPOSIT") ||
            body.includes("ELIGIBLE") ||
            /WITHIN NEXT \d+ DAYS/.test(body)) &&
        !isPaidBillReceipt(body)
    ) {
        return true;
    }

    if (body.includes("HDFC BANK LOAN") && body.includes("EMI")) {
        return true;
    }

    if (body.includes("PAYMENT") && body.includes("HAS FAILED")) {
        return true;
    }

    if (
        body.includes("HAS REQUESTED MONEY") ||
        body.includes("HAS REQUESTED RS") ||
        body.includes("HAS REQUESTED INR") ||
        body.includes("REQUESTED MONEY FROM YOU") ||
        body.includes("ON APPROVING THE REQUEST")
    ) {
        return true;
    }

    if (body.includes("E-INSURANCE ACCOUNT") || body.includes("E INSURANCE ACCOUNT")) {
        return true;
    }

    if (
        (body.includes("CDSL") || sender.includes("CDSL")) &&
        (body.includes("SHARES") || body.includes("BONUS ALLOTMENT"))
    ) {
        return true;
    }

    if (body.includes("CROWNS") && body.includes("CREDITED")) {
        return true;
    }

    if (
        body.includes("SUPERCARD") &&
        body.includes("CREDITED") &&
        !body.includes("PAYMENT OF") &&
        !body.includes("RECEIVED")
    ) {
        return true;
    }

    if (body.includes("SIP CANCELLATION")) {
        return true;
    }

    if (
        body.includes("TOTAL EXPENSE RATIO") &&
        (body.includes("REVISED") || body.includes("WILL BE"))
    ) {
        return true;
    }

    if (body.includes("NEUCOIN")) {
        return true;
    }

    if (
        body.includes("AUTOPAY (E-MANDATE) ACTIVE") ||
        (body.includes("AUTOPAY") && body.includes("ACTIVE!") && !body.includes("SUCCESS"))
    ) {
        return true;
    }

    if (
        body.includes("CREDITS") &&
        (body.includes("VALID FOR") ||
            body.includes("1CREDIT") ||
            body.includes("REDEEM CREDITS"))
    ) {
        return true;
    }

    if (body.includes("EMI DUE")) {
        return true;
    }

    if (body.includes("NOT CREDITED")) {
        return true;
    }

    if (
        body.includes("WILL BE CREDITED") &&
        !isPaidBillReceipt(body) &&
        !isCreditCardPaymentAck(body) &&
        !body.includes("DEBITED")
    ) {
        return true;
    }

    if (sender.includes("JUSPAY") || body.includes("APAY BALANCE")) {
        return true;
    }

    if (
        sender.includes("VICARE") ||
        body.includes("ALTERNATE VI") ||
        (body.includes("PAYTM POSTPAID") && (body.includes("DUE AMOUNT") || body.includes("DUE DATE")))
    ) {
        return true;
    }

    if (/CREDITED WITH INR\s*0(?:\.0+)?\b/.test(body)) {
        return true;
    }

    if (
        sender.includes("EPFO") &&
        !body.includes("PASSBOOK") &&
        !/\b(?:RS|INR|₹)\b/.test(body)
    ) {
        return true;
    }

    if (
        (body.includes("COULD NOT BE PROCESSED") ||
            body.includes("UNSUCCESSFUL") ||
            body.includes("COULD NOT BE COMPLETED") ||
            body.includes("WAS NOT COMPLETED") ||
            body.includes("NOT COMPLETED")) &&
        (body.includes("WILL BE CREDITED") ||
            body.includes("REFUND") ||
            body.includes("WILL GET REFUNDED"))
    ) {
        return true;
    }

    if (isLoginOrPasswordNoise(body)) {
        return true;
    }

    if (isKycUpiChargesNoise(body)) {
        return true;
    }

    if (isOtpNoise(body)) {
        return true;
    }

    if (isCreditCardPaymentAck(body) && !isOwnedCardPaymentAck(body)) {
        return true;
    }

    return false;
}

function isLoginOrPasswordNoise(body: string): boolean {
    if (body.includes("LOGIN ALERT") || body.includes("LOGIN PIN")) {
        return true;
    }

    if (/\bIPIN\b/.test(body)) {
        return true;
    }

    if (
        body.includes("RESET PASSWORD") ||
        body.includes("PASSWORD HAS BEEN") ||
        body.includes("SUCCESSFULLY RESET")
    ) {
        return true;
    }

    if (body.includes("PASSWORD OF YOUR") && body.includes("CHANGED")) {
        return true;
    }

    if (body.includes("ACCESSED PROFILE SECTION")) {
        return true;
    }

    if (body.includes("ACCESSED") && body.includes("INTERNET BANKING")) {
        return true;
    }

    return (
        body.includes("THANK YOU FOR USING") &&
        (body.includes("ONLINE BANKING") ||
            body.includes("NETBANKING") ||
            body.includes("INTERNET BANKING"))
    );
}

function isKycUpiChargesNoise(body: string): boolean {
    if (body.includes("KYC")) {
        return true;
    }

    if (body.includes("SCHEDULE OF CHARGES")) {
        return true;
    }

    if (body.includes("UPI LINK REQUEST")) {
        return true;
    }

    if (body.includes("LINK YOUR") && body.includes("FOR UPI")) {
        return true;
    }

    return (
        body.includes("UPI REGISTRATION") ||
        body.includes("REGISTERED FOR UPI")
    );
}

function isOtpNoise(body: string): boolean {
    if (!body.includes("OTP") && !body.includes("ONE TIME PASSWORD")) {
        return false;
    }

    if (
        body.includes("WITHOUT USING OTP") ||
        body.includes("WITHOUT PIN/OTP") ||
        body.includes("WITHOUT PIN / OTP")
    ) {
        return false;
    }

    return !(
        body.includes("DEBITED") ||
        body.includes("SPENT") ||
        body.includes("CHARGE OF") ||
        /\bINITIATED\b/.test(body)
    );
}

/**
 * Credit-card issuer confirming a payment posted to the card.
 *
 * @param body - Uppercased SMS body
 */
export function isCreditCardPaymentAck(body: string): boolean {
    const isPayment =
        body.includes("PAYMENT OF") ||
        body.includes("ONLINE PAYMENT") ||
        body.includes("PAYMENT HAS BEEN RECEIVED") ||
        body.includes("HAS BEEN RECEIVED TOWARDS") ||
        body.includes("WE HAVE RECEIVED PAYMENT") ||
        body.includes("WE HAVE RECEIVED AND CREDITED PAYMENT") ||
        body.includes("RECEIVED AND CREDITED PAYMENT") ||
        body.includes("WE HAVE RECEIVED A PAYMENT") ||
        body.includes("RECEIVED A PAYMENT") ||
        body.includes("RECEIVED PAYMENT OF") ||
        body.includes("HAVE RECEIVED PAYMENT") ||
        body.includes("CONFIRM RECEIPT") ||
        body.includes("WE CONFIRM RECEIPT");

    if (!isPayment) {
        return false;
    }

    return (
        body.includes("CREDITED TO YOUR CARD") ||
        /CREDITED TO YOUR .{0,40}CARD/.test(body) ||
        body.includes("RECEIVED TOWARDS YOUR CREDIT CARD") ||
        (body.includes("RECEIVED TOWARDS YOUR") && body.includes("CARD ENDING")) ||
        (body.includes("CREDITED TOWARDS YOUR") && body.includes("CREDIT CARD")) ||
        (body.includes("HAS BEEN RECEIVED TOWARDS") && body.includes("CREDIT CARD")) ||
        (body.includes("THANK YOU FOR PAYMENT") && body.includes("CREDIT CARD")) ||
        (body.includes("RECEIVED A PAYMENT") &&
            (body.includes("CREDIT CARD") ||
                body.includes("CARD ENDING") ||
                body.includes("SUPERCARD"))) ||
        (body.includes("CONFIRM RECEIPT") &&
            (body.includes("CARD ENDING") ||
                body.includes("CREDIT CARD") ||
                body.includes("SUPERCARD"))) ||
        (body.includes("PAYMENT OF") &&
            body.includes("TOWARDS YOUR") &&
            body.includes("CREDIT CARD")) ||
        (body.includes("RECEIVED AND CREDITED PAYMENT") &&
            body.includes("CREDIT CARD")) ||
        (body.includes("PAYMENT OF") &&
            body.includes("WAS RECEIVED") &&
            body.includes("CREDIT CARD")) ||
        (body.includes("AGAINST YOUR") &&
            body.includes("CREDIT CARD") &&
            body.includes("PAYMENT"))
    );
}

/**
 * Savings/UPI debit that pays a credit-card bill (CRED, CredClub, CheQ, SBI Cards, Axis).
 * Not a household spend — the card swipe was already the expense.
 *
 * @param body - SMS body (any case)
 */
export function isCardBillPayMessage(body: string): boolean {
    const upper = body.toUpperCase();

    if (
        upper.includes("PAYMENT ON CRED") ||
        upper.includes("UPI-CRED-") ||
        /CRED@[A-Z]/.test(upper)
    ) {
        return true;
    }

    if (
        /(?:;|&)\s*CRED(?:CLUB|\s+CLUB)?\s+CREDITED/.test(upper) ||
        /\bTO\s+CRED(?:CLUB|\s+CLUB)?\b/.test(upper)
    ) {
        return true;
    }

    return /(?:;|&)\s*(?:SBI\s+CARDS?|CHEQ|AXIS)\s+CREDITED/.test(upper);
}

function isCredBillPay(body: string): boolean {
    return isCardBillPayMessage(body);
}

/**
 * Payment posted to a credit card the user still owns (e.g. HDFC 1687).
 */
function isOwnedCardPaymentAck(body: string): boolean {
    const index = loadKnownAccountIndex();
    const last4 =
        body.match(/ENDING(?:\s+WITH)?\s+(?:X{2,4}-)?(\d{4})\b/)?.[1] ??
        body.match(/(?:CARD|ACCT|A\/C)\s+X+-?(\d{4})\b/i)?.[1];

    if (last4) {
        return Boolean(index.resolve(last4));
    }

    if (/ENDING(?:\s+WITH)?\s+\d{2,3}\b/.test(body)) {
        return false;
    }

    if (/\bSBI\s+CREDIT\s+CARD\b|\bSBI\s+CARD\b/.test(body)) {
        return Boolean(
            index.resolveUniqueByBankAndType("State Bank of India", "credit_card")
        );
    }

    return false;
}

/**
 * Debit and credit last4s when the SMS names two masked accounts.
 *
 * @param body - Uppercased SMS body
 */
export function selfTransferLast4s(
    body: string
): { debit: string; credit: string } | undefined {
    const debitToAc = body.match(
        /DEBITED FROM (?:YOUR )?A\/?C\s+[*X]*(\d{3,4})[\s\S]{0,90}?TO A\/?C\s+[*X]*(\d{3,4})/
    );

    if (debitToAc && debitToAc[1] !== debitToAc[2]) {
        return { debit: debitToAc[1], credit: debitToAc[2] };
    }

    const moneyMoved = body.match(
        /MONEY TRANSFERRED[\s\S]{0,80}?A\/?C\s+[*X]*(\d{3,4})[\s\S]{0,80}?TO A\/?C\s+[*X]*(\d{3,4})/
    );

    if (moneyMoved && moneyMoved[1] !== moneyMoved[2]) {
        return { debit: moneyMoved[1], credit: moneyMoved[2] };
    }

    const impsPayee = body.match(
        /DEBITED TO A\/?C\s+[*X]*(\d{3,4})[\s\S]{0,80}?IMPS\/[^/\n]*\/[*X]*(\d{3,4})/
    );

    if (impsPayee && impsPayee[1] !== impsPayee[2]) {
        return { debit: impsPayee[1], credit: impsPayee[2] };
    }

    const fundsTrf = body.match(
        /DEBITED TO A\/?C\s+[*X]*(\d{3,4})[\s\S]{0,80}?FUNDS TRF TO [*X]*(\d{3,4})/
    );

    if (fundsTrf && fundsTrf[1] !== fundsTrf[2]) {
        return { debit: fundsTrf[1], credit: fundsTrf[2] };
    }

    const youTransferred = body.match(
        /TRANSFERRED[\s\S]{0,50}?(?:A\/?C|ACCT)\s+[*X]*(\d{3,4})[\s\S]{0,80}?TO[\s\S]{0,50}?(?:A\/?C|ACCT)\s+[*X]*(\d{3,4})/
    );

    if (youTransferred && youTransferred[1] !== youTransferred[2]) {
        return { debit: youTransferred[1], credit: youTransferred[2] };
    }

    if (!body.includes("DEBITED") || !body.includes("CREDITED")) {
        return undefined;
    }

    const debitLast4 =
        body.match(/(?:X{2,}|\*{2,})(\d{3,4})[^\d]{0,40}(?:IS\s+)?DEBITED/)?.[1] ??
        body.match(/DEBITED[^\d]{0,40}(?:X{2,}|\*{2,})(\d{3,4})/)?.[1];
    const creditLast4 =
        body.match(/(?:X{2,}|\*{2,})(\d{3,4})[^\d]{0,40}CREDITED/)?.[1] ??
        body.match(/CREDITED[^\d]{0,40}(?:X{2,}|\*{2,})(\d{3,4})/)?.[1];

    if (!debitLast4 || !creditLast4 || debitLast4 === creditLast4) {
        return undefined;
    }

    return { debit: debitLast4, credit: creditLast4 };
}

/**
 * Resolves a masked account token from a self-transfer SMS.
 * Four digits are exact last4. Three digits use unique suffix across owned accounts.
 *
 * @param digits - 3 or 4 visible account digits from the SMS
 */
export function resolveOwnedTransferToken(digits: string): KnownAccount | undefined {
    const index = loadKnownAccountIndex();
    const exact = index.resolve(digits);

    if (exact) {
        return exact;
    }

    if (digits.length === 3) {
        return index.resolveUniqueSuffix(digits);
    }

    return undefined;
}

/**
 * Same SMS debits one account and credits another owned account (or "your a/c"
 * to an owned last4). Same VPA from/to is also a self-transfer. Not a spend.
 *
 * @param body - Uppercased SMS body
 */
export function isSelfTransfer(body: string): boolean {
    if (isSameVpaTransfer(body)) {
        return true;
    }

    const last4s = selfTransferLast4s(body);

    if (!last4s) {
        return false;
    }

    const debitOwned = Boolean(resolveOwnedTransferToken(last4s.debit));
    const creditOwned = Boolean(resolveOwnedTransferToken(last4s.credit));

    if (debitOwned && creditOwned) {
        return true;
    }

    return creditOwned && (/YOUR\s+A\/?C/.test(body) || body.includes("OWN ACCOUNT"));
}

/**
 * UPI debit and credit use the same VPA (e.g. vipulism@ybl → vipulism@ybl).
 *
 * @param body - Uppercased SMS body
 */
export function isSameVpaTransfer(body: string): boolean {
    const from = body.match(/FROM:([A-Z0-9._-]+@[A-Z0-9._-]+)/);
    const to = body.match(/TO:([A-Z0-9._-]+@[A-Z0-9._-]+)/);

    return Boolean(from && to && from[1] === to[1]);
}

/**
 * Grocery/app wallet top-up. The wallet is credited, but the user spent the money.
 *
 * @param body - Uppercased SMS body
 */
export function isWalletTopUp(body: string): boolean {
    const isTopUp = body.includes("TOP-UP") || body.includes("TOP UP") || body.includes("TOPUP");

    return isTopUp && body.includes("SUCCESSFUL");
}

/**
 * Statement / due reminder, not a posted spend.
 *
 * @param body - Uppercased SMS body
 */
export function isDueReminder(body: string): boolean {
    if (isPostedSpend(body) || (body.includes("REFUND") && body.includes("CREDITED"))) {
        return false;
    }

    if (
        body.includes("TO BE PAID BY") ||
        body.includes("IS DUE ON") ||
        body.includes("IS DUE BY") ||
        body.includes("IS DUE TODAY") ||
        body.includes("CLEAR YOUR DUES") ||
        body.includes("DUES BY") ||
        body.includes("BILL DUE") ||
        body.includes("PAYMENT DUE") ||
        (body.includes("PAYMENT OF") && /\bIS DUE\b/.test(body)) ||
        body.includes("IS PENDING AGAINST") ||
        (body.includes("PAYMENT OF") && body.includes("PENDING AGAINST")) ||
        ((body.includes("AMOUNT DUE") || body.includes("AMT DUE")) &&
            (body.includes("CREDIT CARD") || body.includes("CARD"))) ||
        ((body.includes("TOTAL DUE") || body.includes("MIN DUE")) &&
            body.includes("CREDIT CARD"))
    ) {
        return true;
    }

    const hasDueAmount =
        body.includes("TOTAL DUE") ||
        body.includes("TOTAL AMOUNT DUE") ||
        body.includes("TOTAL AMT DUE") ||
        body.includes("MIN DUE") ||
        body.includes("MIN AMT DUE") ||
        body.includes("MINIMUM AMOUNT DUE") ||
        body.includes("MINIMUM AMOUNT");

    const hasDueWhen =
        body.includes("DUE ON") ||
        body.includes("DUE BY") ||
        body.includes("DUE DATE") ||
        body.includes("PAYABLE BY") ||
        body.includes("PAY BEFORE") ||
        body.includes("PAY BY");

    return hasDueAmount && hasDueWhen;
}

function isPostedSpend(body: string): boolean {
    return (
        body.includes("SPENT") ||
        body.includes("DEBITED") ||
        body.includes("DEBIT BY TRANSFER") ||
        body.includes("TXN RS") ||
        body.includes("TXN INR") ||
        body.includes("TXN OF") ||
        body.includes("TXN. OF") ||
        (body.includes("CHARGE OF") && body.includes("INITIATED")) ||
        ((body.includes("AUTOPAY") || body.includes("AUTO-PAY")) &&
            body.includes("HAS BEEN PROCESSED"))
    );
}

/**
 * Detects bill, investment, or EPF before falling back to cash-flow kinds.
 *
 * @param message - SMS being classified
 * @param facts - Parsed facts from the same message
 */
export function detectFinancialKind(
    message: SmsMessage,
    facts: FinancialFacts
): FinancialKind {
    const sender = senderNormalize(message.address).sender;
    const body = message.body.toUpperCase();

    if (sender.includes("EPFO") || body.includes("PASSBOOK")) {
        return "epf";
    }

    if (
        isMutualFundMessage(body, sender) ||
        isNewFdMessage(body) ||
        isSgbMessage(body) ||
        isEquityBuyMessage(body) ||
        isZerodhaFundingMessage(body) ||
        isIndianClearingSipMessage(body) ||
        isGrowwFundingMessage(body)
    ) {
        return "investment";
    }

    if (isSelfTransfer(body)) {
        return "transfer";
    }

    if (isWalletTopUp(body)) {
        return "expense";
    }

    if (isCreditCardPaymentAck(body) || isCredBillPay(body)) {
        return "bill";
    }

    if (isPaidBillReceipt(body)) {
        return facts.cashFlow === CashFlow.OUTFLOW ? "expense" : "UNKNOWN";
    }

    if (isBill(body, sender)) {
        return "bill";
    }

    if (facts.cashFlow === CashFlow.OUTFLOW) {
        return "expense";
    }

    if (facts.cashFlow === CashFlow.INFLOW) {
        return "income";
    }

    return "UNKNOWN";
}

function isBill(body: string, sender: string): boolean {
    if (body.includes("REFUND") && body.includes("CREDITED")) {
        return false;
    }

    if (isDueReminder(body)) {
        return true;
    }

    if (body.includes("ELECTRICITY BILL") || body.includes("BSES")) {
        return !isPaidBillReceipt(body);
    }

    if (body.includes("BILL") && (body.includes("DUE ON") || body.includes("DUE BY"))) {
        return true;
    }

    if (sender.includes("IGLMKT")) {
        return true;
    }

    if (body.includes("WILL BE DEDUCTED")) {
        return true;
    }

    if (body.includes("IS PENDING AGAINST") || body.includes("IS DUE ON YOUR")) {
        return true;
    }

    const hasStatement =
        body.includes("STATEMENT") ||
        body.includes("E-STMT") ||
        body.includes("E-STATEMENT");
    const hasDue =
        body.includes("PAYMENT DUE") ||
        body.includes("TOTAL PAYMENT DUE") ||
        body.includes("TOTAL AMT DUE") ||
        body.includes("TOTAL DUE") ||
        body.includes("TOTAL AMOUNT DUE") ||
        body.includes("MIN AMT DUE") ||
        body.includes("MIN DUE") ||
        body.includes("MIN PAYMENT") ||
        body.includes("MINIMUM AMOUNT") ||
        body.includes("PAYABLE BY") ||
        body.includes("DUE BY") ||
        body.includes("DUE DATE") ||
        body.includes("TO BE PAID BY");

    return hasStatement && hasDue;
}

/**
 * Utility bill already paid (Amazon BBPS, bank BillPay). Not a due reminder.
 * Credit-card "payment received towards card" is excluded so skip/ack flow stays intact.
 *
 * @param body - Uppercased SMS body
 */
export function isPaidBillReceipt(body: string): boolean {
    if (
        body.includes("CREDIT CARD") &&
        (body.includes("RECEIVED TOWARDS") || body.includes("CREDITED TO YOUR"))
    ) {
        return false;
    }

    return (
        body.includes("BILL PAYMENT SUCCESSFUL") ||
        body.includes("BILL PAID") ||
        (body.includes("PAYMENT OF") &&
            body.includes("RECEIVED AGAINST") &&
            (body.includes("BP NO") || body.includes("IGL"))) ||
        ((body.includes("BSES") || body.includes("ELECTRICITY BILL")) &&
            body.includes("SUCCESSFUL") &&
            (body.includes("PAYMENT OF") ||
                body.includes("BILL PAYMENT") ||
                body.includes("HAS BEEN SUCCESSFUL"))) ||
        (body.includes("YOUR PAYMENT OF") &&
            body.includes("HAS BEEN RECEIVED") &&
            !body.includes("CREDIT CARD"))
    );
}

/**
 * Bank SMS that books a new fixed deposit from a savings account.
 *
 * @param body - SMS body (any case)
 */
export function isNewFdMessage(body: string): boolean {
    const upper = body.toUpperCase();

    return (
        upper.includes("NEW FD") ||
        upper.includes("FD BOOKED") ||
        upper.includes("FD HAS BEEN")
    );
}

/**
 * Mutual-fund allotment or SIP SMS (AMC / RTA / folio+NAV).
 *
 * @param body - SMS body (any case)
 * @param sender - Normalized or raw sender id
 */
export function isMutualFundMessage(body: string, sender = ""): boolean {
    const upper = body.toUpperCase();
    const from = sender.toUpperCase();

    return (
        from.includes("PPFAMF") ||
        from.includes("IPRUMF") ||
        from.includes("CAMS") ||
        from.includes("AXISMF") ||
        upper.includes("MUTUAL FUND") ||
        (upper.includes("FOLIO") && upper.includes("NAV"))
    );
}

/**
 * Sovereign Gold Bond purchase or allotment with a cash amount.
 *
 * @param body - SMS body (any case)
 */
export function isSgbMessage(body: string): boolean {
    const upper = body.toUpperCase();

    return upper.includes("SOVEREIGN GOLD") || /\bSGB\b/.test(upper);
}

/**
 * Cash equity/demat buy. Bonus allotments are skipped elsewhere.
 *
 * @param body - SMS body (any case)
 */
export function isEquityBuyMessage(body: string): boolean {
    const upper = body.toUpperCase();

    if (upper.includes("BONUS ALLOTMENT") || upper.includes("BONUS SHARE")) {
        return false;
    }

    const product =
        upper.includes("DEMAT") ||
        upper.includes("EQUITY") ||
        upper.includes("SHARES");
    const buy =
        upper.includes("PURCHASE") ||
        upper.includes("BOUGHT") ||
        /\bBUY\b/.test(upper);

    return product && buy;
}

/**
 * Bank UPI/card debit that funds Zerodha (or ICCL Zerodha clearing), not spend.
 *
 * @param body - SMS body (any case)
 */
export function isZerodhaFundingMessage(body: string): boolean {
    const upper = body.toUpperCase();

    if (!upper.includes("ZERODHA")) {
        return false;
    }

    return upper.includes("DEBITED") || upper.includes("SPENT");
}

/**
 * UPI debit to Indian Clearing / IndianClearingC (BSE Star MF / SIP), not ICCL Zerodha equity.
 *
 * @param body - SMS body (any case)
 */
export function isIndianClearingSipMessage(body: string): boolean {
    const upper = body.toUpperCase();

    if (upper.includes("ZERODHA") || !/\bINDIAN\s*CLEARINGC?\b/.test(upper)) {
        return false;
    }

    return upper.includes("DEBITED") || upper.includes("SPENT");
}

/**
 * Broker or MF-clearing UPI funding that must not appear as household spend.
 *
 * @param body - SMS body (any case)
 */
export function isInvestmentFundingMessage(body: string): boolean {
    return (
        isZerodhaFundingMessage(body) ||
        isIndianClearingSipMessage(body) ||
        isGrowwFundingMessage(body)
    );
}

/**
 * NACH/ACH debit to Groww (MF SIP), not a household spend.
 *
 * @param body - SMS body (any case)
 */
export function isGrowwFundingMessage(body: string): boolean {
    const upper = body.toUpperCase();

    if (!upper.includes("GROWW")) {
        return false;
    }

    return upper.includes("ACH*GROWW") || upper.includes("INFOACH") || /\bNACH\b/.test(upper);
}
