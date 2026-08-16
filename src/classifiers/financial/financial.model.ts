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
  id: string;
  type: string;
  merchant: string;
  amount: number;
  currency: string;
  cash_flow: string;
  bank: string;
  account_last4: string;
  available_balance: number;
  transaction_type: string;
  source_file: string;
  created_at: Date;
  updated_at: Date;
}