/**
 * An account the user owns, used to identify which last4 an SMS refers to.
 */
export interface KnownAccount {
    name: string;
    bank: string;
    last4: string;
    type: "savings" | "credit_card" | "loan" | "wallet" | "investment" | "epf";
}

export interface KnownAccountsFile {
    accounts: KnownAccount[];
}
