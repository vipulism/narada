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
    accountName?: string;
    availableBalance?:number;
    transactionDate?: string;
    dueDate?: string;

}


export interface FinancialEvent {
    smsId: number;
    kind: string;
    cashFlow: string;
    amount: number;
    currency: string;
    accountLast4?: string;
    /** Credit/destination last4 for owned-to-owned transfers (loan or savings). */
    counterpartyLast4?: string;
    accountName?: string;
    bank?: string;
    merchant?: string;
    transactionType?: string;
    occurredAt: Date;
    /** Firefly III transaction journal id after a successful push. */
    fireflyTransactionId?: string;
    fireflyPushedAt?: Date;
}
