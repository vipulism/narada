import {
    ACCOUNT_REGEX,
    ATM_REGEX,
    AVAILABLE_BALANCE_REGEX,
    CARD_LAST4_REGEX,
    CREDIT_KEYWORDS,
    DEBIT_KEYWORDS,
    IMPS_REGEX,
    INR_AMOUNT_REGEX,
    MERCHANT_AT_REGEX,
    MERCHANT_TO_REGEX,
    NEFT_REGEX,
    RS_AMOUNT_REGEX,
    RTGS_REGEX,
    RUPEE_SYMBOL_AMOUNT_REGEX,
    UPI_REGEX,
} from "./financial.regex";

import { CashFlow, FinancialFacts } from "./financial.model";
import { SmsMessage } from "../../importers/sms/sms.model";
import { senderNormalize } from "../common/senderNormalizer";
import { BANKS } from "./financial.constants";
import { SenderInfo } from "../common/sender.model";

export class FinancialParser {

    parse(message: SmsMessage): FinancialFacts {

        const body = message.body;

        return {
            amount: this.extractAmount(body),
            currency: this.extractCurrency(body),
            cashFlow: this.extractCashFlow(body),
            merchant: this.extractMerchant(body),
            accountLast4: this.extractAccountLast4(body),
            availableBalance: this.extractAvailableBalance(body),
            transactionType: this.extractTransactionType(body),
            bank: this.extractBank(message),
        };

    }

    private extractBank(message: SmsMessage): string | undefined {
        const sender = senderNormalize(message.address);

        return this.extractBankFromSender(sender) ?? this.extractBankFromBody(message.body);
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

    private extractCashFlow(body: string): CashFlow | undefined {

        const upper = body.toUpperCase();

        if (CREDIT_KEYWORDS.some(keyword => upper.includes(keyword))) {
            return CashFlow.INFLOW;
        }

        if (DEBIT_KEYWORDS.some(keyword => upper.includes(keyword))) {
            return CashFlow.OUTFLOW;
        }

        return CashFlow.NEUTRAL;

    }

    private extractMerchant(body: string): string | undefined {

        const regexes = [
            MERCHANT_AT_REGEX,
            MERCHANT_TO_REGEX,
        ];

        for (const regex of regexes) {

            const match = body.match(regex);

            if (match) {
                return match[1].trim();
            }

        }

        return undefined;

    }

    private extractAvailableBalance(body: string): number | undefined {

        const match = body.match(AVAILABLE_BALANCE_REGEX);

        if (match) {
            return this.parseAmount(match[1]);
        }

        return undefined;

    }

    private extractAccountLast4(body: string): string | undefined {

        let match = body.match(CARD_LAST4_REGEX);

        if (match) {
            return match[1];
        }

        match = body.match(ACCOUNT_REGEX);

        if (match) {
            const value = match[1];
            return value.slice(-4);
        }

        return undefined;

    }

    private extractTransactionType(body: string): string | undefined {

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