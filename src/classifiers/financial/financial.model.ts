export enum CashFlow {
    INFLOW = "INFLOW",
    OUTFLOW = "OUTFLOW",
    NEUTRAL = "NEUTRAL"
}

export interface FinancialFacts {

    amount?: number;
    currency?: string;
    cashFlow?: CashFlow;
    bank?: string;
    merchant?: string;
    transactionType?: string;
    accountLast4?: string;
    balance?: number;

}