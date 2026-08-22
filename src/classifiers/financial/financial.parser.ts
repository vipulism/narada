import {
    ACCOUNT_REGEX,
    ACCT_MASKED_DIGITS_REGEX,
    ATM_REGEX,
    AVAILABLE_BALANCE_REGEX,
    BBPS_REGEX,
    CARD_BARE_LAST4_REGEX,
    CARD_LAST4_REGEX,
    CARD_MASKED_LAST4_REGEX,
    EPF_BALANCE_REGEX,
    FASTAG_LAST4_REGEX,
    FASTAG_TAG_LAST4_REGEX,
    CARD_PAREN_LAST4_REGEX,
    IMPS_REGEX,
    INR_AMOUNT_REGEX,
    MASKED_LAST4_REGEX,
    MERCHANT_AT_REGEX,
    MERCHANT_TO_REGEX,
    NEFT_REGEX,
    RS_AMOUNT_REGEX,
    RTGS_REGEX,
    RUPEE_SYMBOL_AMOUNT_REGEX,
    TRANSACTION_DATE_REGEX,
    UPI_REGEX,
} from "./financial.regex";

import { CashFlow, FinancialFacts } from "./financial.model";
import { SmsMessage } from "../../importers/sms/sms.model";
import { senderNormalize } from "../common/senderNormalizer";
import { BANKS } from "./financial.constants";
import { SenderInfo } from "../common/sender.model";
import { inferOwnedAccountType, namesCreditCard } from "./financial.accountType";
import { parseDueDate } from "./financial.due";
import { KnownAccountIndex, loadKnownAccountIndex } from "./knownAccounts";
import { KnownAccount } from "./knownAccount.model";
import { isCreditCardPaymentAck, isDueReminder, isPaidBillReceipt, isSelfTransfer, isWalletTopUp, resolveOwnedTransferToken, selfTransferLast4s } from "./financial.kind";

/**
 * SMS Backup XML often stores newlines as `&#10;` in the body.
 *
 * @param body - Raw SMS text
 */
export function decodeSmsText(body: string): string {
    return body
        .replace(/&#10;/gi, "\n")
        .replace(/&#13;/gi, "")
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, digits) => {
            const code = Number(digits);
            return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : "";
        });
}

const MONTHS: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
};

/**
 * Extracts structured financial facts from an SMS body and sender.
 */
export class FinancialParser {

    constructor(private readonly knownAccounts: KnownAccountIndex = loadKnownAccountIndex()) {}

    /**
     * Parses amount, cash flow, last4, merchant, bank, and optional body date.
     *
     * @param message - SMS to parse
     * @returns Facts present in the message; missing fields stay undefined
     */
    parse(message: SmsMessage): FinancialFacts {

        const body = decodeSmsText(message.body);
        const matchedAccount = this.matchOwnedAccount({ ...message, body });

        return {
            amount: this.extractAmount(body),
            currency: this.extractCurrency(body),
            cashFlow: this.extractCashFlow(body, matchedAccount),
            merchant: this.extractMerchant(body),
            accountLast4: matchedAccount?.last4 ?? this.fourDigitAccount(body),
            accountName: matchedAccount?.name,
            availableBalance: this.extractAvailableBalance(body),
            transactionType: this.extractTransactionType(body),
            bank: matchedAccount?.bank ?? this.extractBank(message),
            transactionDate: this.extractTransactionDate(body),
            dueDate: this.extractDueDate(body, message.receivedAt),
        };

    }

    /**
     * Identifies which owned account the SMS is about.
     * Four visible digits → exact last4 only. Three visible digits → last3 + same bank.
     * Two visible ending digits (SBI CARD ending 85) match only if a unique card
     * at that bank actually ends with those two digits — never map 85 onto 8561.
     */
    private matchOwnedAccount(message: SmsMessage): KnownAccount | undefined {
        const body = message.body;
        const digits = this.extractAccountDigits(body);
        const ending = this.extractEndingDigits(body);
        const bank = this.extractBank(message);
        const transferAccount = this.matchSelfTransferAccount(body);

        if (transferAccount) {
            return transferAccount;
        }

        if (digits?.length === 4) {
            return (
                this.knownAccounts.resolve(digits) ?? this.firstOwnedLast4(body)
            );
        }

        if (digits?.length === 3) {
            return this.knownAccounts.resolve(digits, bank);
        }

        if (this.isFastagMessage(body)) {
            return this.knownAccounts.resolveUniqueByBank("FASTag");
        }

        if (!bank) {
            return undefined;
        }

        if (namesCreditCard(body)) {
            const uniqueCard = this.knownAccounts.resolveUniqueByBankAndType(
                bank,
                "credit_card"
            );

            if (uniqueCard && this.endingDigitsAgree(ending, uniqueCard.last4)) {
                return uniqueCard;
            }

            if (ending && uniqueCard && !this.endingDigitsAgree(ending, uniqueCard.last4)) {
                return undefined;
            }
        }

        const inferredType = inferOwnedAccountType(body);

        if (inferredType && inferredType !== "credit_card") {
            const uniqueTyped = this.knownAccounts.resolveUniqueByBankAndType(
                bank,
                inferredType
            );

            if (uniqueTyped && this.endingDigitsAgree(ending, uniqueTyped.last4)) {
                return uniqueTyped;
            }
        }

        if (ending && ending.length < 4) {
            return undefined;
        }

        return this.knownAccounts.resolveUniqueByBank(bank);
    }

    /**
     * For a self-transfer SMS, prefer the owned debit account, else the owned credit.
     */
    private matchSelfTransferAccount(body: string): KnownAccount | undefined {
        const upper = body.toUpperCase();

        if (!isSelfTransfer(upper)) {
            return undefined;
        }

        const last4s = selfTransferLast4s(upper);

        if (!last4s) {
            return undefined;
        }

        return (
            resolveOwnedTransferToken(last4s.debit) ??
            resolveOwnedTransferToken(last4s.credit)
        );
    }

    /**
     * Visible digits after "ending" / "ending with", including 2-digit tokens.
     */
    private extractEndingDigits(body: string): string | undefined {
        const match = body.match(/ending(?:\s+with)?\s+(?:x{1,4}|\*+)?(\d{2,4})\b/i);

        return match?.[1];
    }

    private endingDigitsAgree(ending: string | undefined, last4: string): boolean {
        if (!ending) {
            return true;
        }

        return last4.endsWith(ending);
    }

    private extractBank(message: SmsMessage): string | undefined {
        if (this.isFastagMessage(message.body)) {
            return "FASTag";
        }

        const sender = senderNormalize(message.address);

        return this.extractBankFromSender(sender) ?? this.extractBankFromBody(message.body);
    }

    private isFastagMessage(body: string): boolean {
        return (
            /\bFASTAG\b/i.test(body) ||
            FASTAG_TAG_LAST4_REGEX.test(body) ||
            (/\btoll paid\b/i.test(body) && /\btag\b/i.test(body))
        );
    }

    private extractBankFromSender(info: SenderInfo): string | undefined {
        const sender = info.sender;

        const bank = BANKS.find(bank =>
            bank.senderCodes.some(code => sender.includes(code))
        );

        return bank?.name;

    }


    private extractBankFromBody(body: string): string | undefined {

        const upper = body.toUpperCase();

        const bank = BANKS.find(bank =>
            bank.aliases.some(alias => upper.includes(alias))
        );

        return bank?.name;
    }

    private extractAmount(body: string): number | undefined {

        const regexes = [
            INR_AMOUNT_REGEX,
            RS_AMOUNT_REGEX,
            RUPEE_SYMBOL_AMOUNT_REGEX,
        ];

        for (const regex of regexes) {

            const match = body.match(regex);

            if (match) {
                return this.parseAmount(match[1]);
            }

        }

        return undefined;

    }

    private extractCurrency(body: string): string | undefined {

        const upper = body.toUpperCase();

        if (
            upper.includes("INR") ||
            upper.includes("RS") ||
            upper.includes("₹")
        ) {
            return "INR";
        }

        return undefined;

    }

    private extractCashFlow(body: string, account?: KnownAccount): CashFlow | undefined {

        const upper = body.toUpperCase();

        if (upper.includes("WILL BE DEDUCTED") || upper.includes("WILL BE DEBITED")) {
            return CashFlow.NEUTRAL;
        }

        if (isSelfTransfer(upper) || isDueReminder(upper) || isCreditCardPaymentAck(upper)) {
            return CashFlow.NEUTRAL;
        }

        if (isWalletTopUp(upper)) {
            return CashFlow.OUTFLOW;
        }

        const accountFlow = this.cashFlowFromAccountClauses(upper, account);

        if (accountFlow) {
            return accountFlow;
        }

        if (this.isUserSendTemplate(upper)) {
            return CashFlow.OUTFLOW;
        }

        if (this.isUserReceiveTemplate(upper) && account?.type !== "credit_card") {
            return CashFlow.INFLOW;
        }

        return CashFlow.NEUTRAL;

    }

    /**
     * Direction comes from the clause that names the user's account/card.
     * "MUKESH KUMAR credited" has no account token, so it is ignored.
     * Credit posted to a credit card is never income.
     */
    private cashFlowFromAccountClauses(
        body: string,
        account?: KnownAccount
    ): CashFlow | undefined {
        let inflow: CashFlow | undefined;

        for (const clause of this.splitClauses(body)) {
            if (!this.clauseHasUserAccount(clause)) {
                continue;
            }

            if (this.clauseHasDebitVerb(clause)) {
                return CashFlow.OUTFLOW;
            }

            if (
                this.clauseHasCreditVerb(clause) &&
                !this.isCreditCardCredit(clause, account)
            ) {
                inflow = CashFlow.INFLOW;
            }
        }

        return inflow;
    }

    private splitClauses(body: string): string[] {
        return body
            .split(/[;\n|]+/)
            .map((clause) => clause.trim())
            .filter((clause) => clause.length > 0);
    }

    private clauseHasUserAccount(clause: string): boolean {
        return (
            /\b(?:ACCT|ACC|ACCOUNT|A\/C|AC|CARD|FASTAG|LOAN)\b/.test(clause) ||
            /\bYOUR\s+(?:ACCT|ACC|ACCOUNT|A\/C|AC|CARD|FASTAG|LOAN)\b/.test(clause) ||
            /(?:X{2,}|\*{2,})\d{3,}\b/.test(clause)
        );
    }

    private clauseHasDebitVerb(clause: string): boolean {
        const cleaned = clause
            .replace(/ALREADY PAID/g, " ")
            .replace(/IF PAID/g, " ")
            .replace(/TO BE PAID/g, " ")
            .replace(/IGNORE IF.{0,20}PAID/g, " ");

        return /\b(?:DEBITED|WITHDRAWN|SPENT|PAID|DEBIT BY TRANSFER)\b/.test(cleaned);
    }

    private clauseHasCreditVerb(clause: string): boolean {
        return /\b(?:CREDITED|DEPOSITED)\b/.test(clause);
    }

    /**
     * Any credit posted to a credit card (payment, refund, waiver) is not income.
     */
    private isCreditCardCredit(clause: string, account?: KnownAccount): boolean {
        if (account?.type === "credit_card") {
            return true;
        }

        return (
            /\bCREDIT\s+CARD\b/.test(clause) ||
            /\bSUPERCARD\b/.test(clause) ||
            /\bCARD\s+ACCOUNT\b/.test(clause) ||
            /\bCARD\s+ENDING\b/.test(clause) ||
            /\bYOUR\s+(?:CREDIT\s+)?CARD\b/.test(clause) ||
            (/\bCARD\b/.test(clause) && !/\b(?:ACCT|ACC|ACCOUNT|A\/C)\b/.test(clause))
        );
    }

    private isUserSendTemplate(body: string): boolean {
        if (
            body.includes("AMT SENT") ||
            body.includes("AMOUNT SENT") ||
            body.includes("SENT RS") ||
            body.includes("SPENT") ||
            /\bPAID\s+RS\.?\s*\d/.test(body) ||
            body.includes("THANKS FOR PAYING") ||
            /\bPAYING\s+RS\.?\s*\d/.test(body) ||
            body.includes("HAS BEEN USED") ||
            body.includes("IS USED AT") ||
            body.includes("USED AT") ||
            /\bUSED\s+RS\.?\s*\d/.test(body) ||
            body.includes("MONEY TRANSFERRED") ||
            /\bTRANSFERRED TO\b/.test(body) ||
            body.includes("YOU'VE TRANSFERRED") ||
            body.includes("YOU’VE TRANSFERRED") ||
            body.includes("YOU HAVE TRANSFERRED") ||
            body.includes("HAS BEEN WITHDRAWN") ||
            body.includes("CARDLESS CASH") ||
            (body.includes("PAYZAPP") && body.includes("DEBITED")) ||
            body.includes("TXN RS") ||
            body.includes("TXN INR") ||
            body.includes("CURRENT TXN AMT") ||
            body.includes("AUTOPAY (E-MANDATE) SUCCESS") ||
            ((body.includes("AUTOPAY") || body.includes("AUTO-PAY")) &&
                body.includes("HAS BEEN PROCESSED")) ||
            body.includes("DEBIT BY TRANSFER") ||
            body.includes("AMOUNT PAID FOR") ||
            (body.includes("PAYMENT OF") &&
                body.includes("SUCCESSFUL") &&
                !body.includes("HAS FAILED"))
        ) {
            return true;
        }

        if (body.includes("CHARGE OF") && body.includes("INITIATED")) {
            return true;
        }

        if (this.isPremiumPayment(body)) {
            return true;
        }

        if (this.isMerchantOrder(body)) {
            return true;
        }

        if (isPaidBillReceipt(body)) {
            return true;
        }

        if (this.isMetroRecharge(body)) {
            return true;
        }

        if (!this.isFastagMessage(body)) {
            return false;
        }

        return (
            body.includes("TXN OF") ||
            body.includes("TXN. OF") ||
            body.includes("TRANSACTION OF") ||
            body.includes("TOLL PAID") ||
            body.includes("RECHARGED") ||
            body.includes("DONE AT")
        );
    }

    private isMetroRecharge(body: string): boolean {
        return (
            body.includes("METRO") &&
            body.includes("RECHARGE") &&
            body.includes("SUCCESSFUL")
        );
    }

    /**
     * Insurer or bill-pay app confirming the user paid a premium.
     */
    private isPremiumPayment(body: string): boolean {
        if (body.includes("HAS FAILED") || body.includes("PAYMENT HAS FAILED")) {
            return false;
        }

        const isPolicy =
            body.includes("POLICY") ||
            body.includes("INSURANCE") ||
            body.includes("PREMIUM");

        if (!isPolicy) {
            return false;
        }

        return (
            body.includes("WE HAVE RECEIVED A PAYMENT") ||
            body.includes("WE HAVE RECEIVED AN AMOUNT") ||
            body.includes("RECEIVED AN AMOUNT") ||
            body.includes("YOUR PAYMENT OF") ||
            body.includes("THANKS FOR PAYING") ||
            (body.includes("PAYMENT OF") && body.includes("HAS BEEN SUCCESSFUL"))
        );
    }

    /**
     * Merchant order SMS with a payable amount, e.g. Domino's Amount:Rs. 187.
     */
    private isMerchantOrder(body: string): boolean {
        const hasOrder = body.includes("ORDER NO") || body.includes("YOUR ORDER");
        const hasAmount = /AMOUNT\s*:?\s*RS/.test(body);

        return hasOrder && hasAmount;
    }

    private isUserReceiveTemplate(body: string): boolean {
        return (
            body.includes("AMT RECEIVED") ||
            body.includes("AMOUNT RECEIVED") ||
            body.includes("MONEY RECEIVED") ||
            (body.includes("PAYZAPP") && body.includes("CREDITED"))
        );
    }

    private extractMerchant(body: string): string | undefined {
        if (this.isStatementBody(body)) {
            return this.extractBiller(body);
        }

        const insurer = this.extractInsurer(body);

        if (insurer) {
            return insurer;
        }

        if (/\bblinkit\b/i.test(body) || /blinkit\d/i.test(body)) {
            return "Blinkit";
        }

        if (/\bzerodha\b/i.test(body)) {
            return "Zerodha";
        }

        if (/\bindian clearing\b/i.test(body)) {
            return "Indian Clearing";
        }

        if (/\bdomino'?s\b/i.test(body) || /\bdominos\b/i.test(body) || /dominos?pizza/i.test(body)) {
            return "Domino's";
        }

        if (/\bolacabs\b/i.test(body) || /\bolamoney\b/i.test(body)) {
            return "Ola";
        }

        if (/\bmilkbasket\b/i.test(body)) {
            return "Milkbasket";
        }

        if (/\bbses\b/i.test(body)) {
            return "BSES";
        }

        if (/\btata play fiber\b/i.test(body) || /\btp fiber\b/i.test(body)) {
            return "Tata Play Fiber";
        }

        if (
            /\bairtel\b/i.test(body) &&
            /wifi|wi-fi|fixedline|fixed\s+line|broadband|xstream/i.test(body)
        ) {
            return "Airtel";
        }

        const regexes = [
            MERCHANT_AT_REGEX,
            MERCHANT_TO_REGEX,
        ];

        for (const regex of regexes) {

            const match = body.match(regex);

            if (!match) {
                continue;
            }

            const merchant = this.normalizeMerchant(match[1].trim());

            if (this.isInvalidMerchant(merchant)) {
                continue;
            }

            return merchant;

        }

        const upiPayee = this.extractUpiPayee(body);

        if (upiPayee) {
            return upiPayee;
        }

        const upiAt = body.match(
            /@UPI[_ ]([A-Z0-9][A-Z0-9 ]{1,40}?)(?=\s+\d{1,2}-|\s+Avl|\s*$)/i
        );

        if (upiAt) {
            const merchant = this.normalizeMerchant(upiAt[1].trim());

            if (!this.isInvalidMerchant(merchant)) {
                return merchant;
            }
        }

        const spentOn = this.extractCardSpendMerchant(body);

        if (spentOn) {
            return spentOn;
        }

        return this.extractBiller(body) ?? this.extractCreditedPayee(body);

    }

    /**
     * Merchant from an SMS body. Decodes XML newline entities first.
     *
     * @param body - Raw or entity-encoded SMS text
     */
    extractMerchantFromBody(body: string): string | undefined {
        return this.extractMerchant(decodeSmsText(body));
    }

    /**
     * UPI SMS often names the payee: `At shop@okaxis`, `To:name@ybl`, `trf to SHARMA KIRANA`.
     */
    private extractUpiPayee(body: string): string | undefined {
        const patterns = [
            /\bat\s+([A-Za-z0-9][A-Za-z0-9._\-]{1,60}@[A-Za-z0-9.]{2,30})\b/i,
            /\bTo:([A-Za-z0-9._\-]+@[A-Za-z0-9.]{2,30})\b/i,
            /\btrf\s+to\s+([A-Za-z][A-Za-z0-9@._\-& ]{1,40}?)(?=\s+Ref|\s+UPI|\s+on\b|\s*$)/i,
        ];

        for (const pattern of patterns) {
            const match = body.match(pattern);

            if (!match?.[1]) {
                continue;
            }

            const merchant = this.normalizeMerchant(match[1].trim());

            if (!this.isInvalidMerchant(merchant)) {
                return merchant;
            }
        }

        return undefined;
    }

    /**
     * ICICI / similar: `spent using Card XX0004 on 20-Aug-26 on AMAZON PAY IN E.`
     */
    private extractCardSpendMerchant(body: string): string | undefined {
        const match = body.match(
            /\bspent\b[\s\S]{0,120}?\bon\s+\d{1,2}[-/][A-Za-z]{3}[-/]\d{2}\s+on\s+([A-Z][A-Z0-9 .&*'-]{2,50}?)(?=\.\s|\s+Avl|\s+If not|$)/i
        );

        if (!match?.[1]) {
            return undefined;
        }

        const merchant = this.normalizeMerchant(match[1].trim().replace(/\.+$/, ""));

        if (this.isInvalidMerchant(merchant)) {
            return undefined;
        }

        return merchant;
    }

    private extractInsurer(body: string): string | undefined {
        if (/\bmax\s*life\b/i.test(body) || /MAXLIFE/i.test(body)) {
            return "Max Life";
        }

        return undefined;
    }

    private isStatementBody(body: string): boolean {
        const upper = body.toUpperCase();

        return (
            (upper.includes("STATEMENT") || upper.includes("E-STMT")) &&
            (upper.includes("TOTAL DUE") ||
                upper.includes("MIN DUE") ||
                upper.includes("PAYMENT DUE"))
        );
    }

    private extractBiller(body: string): string | undefined {
        const match = body.match(
            /(?:electricity\s+bill\s+for|bill\s+for)\s+([A-Za-z][A-Za-z ]+?)\s+consumer/i
        );

        if (!match) {
            return undefined;
        }

        return match[1].trim();
    }

    private extractCreditedPayee(body: string): string | undefined {
        const match = body.match(/\b([A-Z][A-Z. ]{2,40}?)\s+credited\b/i);

        if (!match) {
            return undefined;
        }

        const payee = match[1].trim();
        const ignored = /^(HAS BEEN|YOUR|ACCOUNT|A\/?C|ACCT|BEEN|WAS|CASHBACK|WILL BE)$/i;

        if (ignored.test(payee) || this.isInvalidMerchant(payee)) {
            return undefined;
        }

        return payee;
    }

    /**
     * MYNTRA72883 → MYNTRA. UPI handles like PWC_IRCTC_UPI stay intact.
     */
    private normalizeMerchant(value: string): string {
        const trimmed = value.trim();

        if (/@|_UPI\b|_/.test(trimmed)) {
            return trimmed;
        }

        return this.stripCardPosPrefix(trimmed)
            .replace(/\*+\d+$/i, "")
            .replace(/\d+$/g, "")
            .trim();
    }

    /**
     * Card POS `IND*LinkedIn` / `RAZ*SHOP` — keep the shop, drop the acquirer prefix.
     * Leaves terminal ids like `NFS*P3ECND77` intact.
     *
     * @param value - Raw merchant token
     */
    private stripCardPosPrefix(value: string): string {
        const match = value.match(/^([A-Za-z]{2,5})\*(.+)$/);

        if (!match) {
            return value;
        }

        const rest = match[2].trim().replace(/\.+$/, "");

        if (!/^[A-Za-z]/.test(rest) || !/[A-Za-z]{3,}/.test(rest)) {
            return value;
        }

        if (!/\s/.test(rest) && /\d/.test(rest)) {
            return value;
        }

        return rest;
    }

    private isInvalidMerchant(value: string): boolean {
        const trimmed = value.replace(/[.,;]+$/g, "").trim();

        if (!trimmed || /^\d+$/.test(trimmed)) {
            return true;
        }

        if (/^A\/?C\s*[X*]+\d*$/i.test(value)) {
            return true;
        }

        if (/^[X*]+\d{2,}$/i.test(value)) {
            return true;
        }

        if (/card\s+ending/i.test(trimmed) || /^your\b/i.test(trimmed)) {
            return true;
        }

        if (
            /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(trimmed)
        ) {
            return true;
        }

        if (/^(be|the|us|it|made|enable)\b/i.test(trimmed)) {
            return true;
        }

        if (/cashback/i.test(trimmed)) {
            return true;
        }

        if (
            /^(clearing|avoid|report|ignore if|if not you)\b/i.test(trimmed) ||
            /avoid charges/i.test(trimmed) ||
            /ignore if/i.test(trimmed) ||
            /if not you/i.test(trimmed) ||
            /^\d{10}\b/.test(trimmed)
        ) {
            return true;
        }

        if (trimmed.split(/\s+/).length > 6) {
            return true;
        }

        return false;
    }

    private extractAvailableBalance(body: string): number | undefined {

        const match = body.match(AVAILABLE_BALANCE_REGEX) ?? body.match(EPF_BALANCE_REGEX);

        if (match) {
            return this.parseAmount(match[1]);
        }

        return undefined;

    }

    /**
     * Visible account digits as they appear in the SMS (3 or 4), never shortened from 4 to 3.
     */
    private extractAccountDigits(body: string): string | undefined {
        const withoutFolio = body.replace(/folio\s+[x*\d]+/gi, " ");
        const regexes = [
            FASTAG_LAST4_REGEX,
            FASTAG_TAG_LAST4_REGEX,
            CARD_LAST4_REGEX,
            CARD_PAREN_LAST4_REGEX,
            CARD_MASKED_LAST4_REGEX,
            CARD_BARE_LAST4_REGEX,
            ACCT_MASKED_DIGITS_REGEX,
            ACCOUNT_REGEX,
            MASKED_LAST4_REGEX,
        ];

        for (const regex of regexes) {
            const match = withoutFolio.match(regex);

            if (!match) {
                continue;
            }

            const digits = match[1].replace(/[Xx*]/g, "");

            if (digits.length === 3 || digits.length === 4) {
                return digits;
            }

            if (digits.length > 4) {
                return digits.slice(-4);
            }
        }

        return undefined;
    }

    /**
     * First owned last4 in the SMS when the first token is not an owned account
     * (e.g. self-transfer names an old a/c then an owned a/c).
     */
    private firstOwnedLast4(body: string): KnownAccount | undefined {
        for (const last4 of this.extractAllLast4s(body)) {
            const account = this.knownAccounts.resolve(last4);

            if (account) {
                return account;
            }
        }

        return undefined;
    }

    private extractAllLast4s(body: string): string[] {
        const withoutFolio = body.replace(/folio\s+[x*\d]+/gi, " ");
        const regexes = [
            FASTAG_LAST4_REGEX,
            FASTAG_TAG_LAST4_REGEX,
            CARD_LAST4_REGEX,
            CARD_PAREN_LAST4_REGEX,
            CARD_MASKED_LAST4_REGEX,
            CARD_BARE_LAST4_REGEX,
            ACCT_MASKED_DIGITS_REGEX,
            ACCOUNT_REGEX,
            MASKED_LAST4_REGEX,
        ];
        const found: string[] = [];
        const seen = new Set<string>();

        for (const regex of regexes) {
            const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);

            for (const match of withoutFolio.matchAll(global)) {
                const digits = match[1].replace(/[Xx*]/g, "");
                const last4 = digits.length > 4 ? digits.slice(-4) : digits;

                if (last4.length === 4 && !seen.has(last4)) {
                    seen.add(last4);
                    found.push(last4);
                }
            }
        }

        return found;
    }

    private fourDigitAccount(body: string): string | undefined {
        const owned = this.firstOwnedLast4(body);

        if (owned) {
            return owned.last4;
        }

        const digits = this.extractAccountDigits(body);

        return digits?.length === 4 ? digits : undefined;
    }

    private extractTransactionDate(body: string): string | undefined {
        const match = body.match(TRANSACTION_DATE_REGEX);

        if (!match) {
            return undefined;
        }

        return this.normalizeTransactionDate(match[1]) ?? match[1];
    }

    private extractDueDate(body: string, receivedAt?: Date): string | undefined {
        return parseDueDate(body, receivedAt) ?? undefined;
    }

    private normalizeTransactionDate(value: string): string | undefined {
        const monthName = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);

        if (monthName) {
            const month = MONTHS[monthName[2].toUpperCase()];
            if (!month) {
                return undefined;
            }

            return `${this.normalizeYear(monthName[3])}-${month}-${monthName[1].padStart(2, "0")}`;
        }

        const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

        if (numeric) {
            return `${this.normalizeYear(numeric[3])}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
        }

        return undefined;
    }

    private normalizeYear(year: string): string {
        if (year.length === 2) {
            return `20${year}`;
        }

        return year;
    }

    private extractTransactionType(body: string): string | undefined {

        if (BBPS_REGEX.test(body)) {
            return "BBPS";
        }

        if (UPI_REGEX.test(body)) {
            return "UPI";
        }

        if (IMPS_REGEX.test(body)) {
            return "IMPS";
        }

        if (NEFT_REGEX.test(body)) {
            return "NEFT";
        }

        if (RTGS_REGEX.test(body)) {
            return "RTGS";
        }

        if (ATM_REGEX.test(body)) {
            return "ATM";
        }

        return undefined;

    }

    private parseAmount(value: string): number {

        return Number(
            value
                .replace(/,/g, "")
                .trim()
        );

    }

}
