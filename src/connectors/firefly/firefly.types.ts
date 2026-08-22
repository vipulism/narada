/**
 * Firefly III account fields Narada uses for last4 mapping.
 */
export interface FireflyAccount {
    id: string;
    name: string;
    type: string;
    accountNumber?: string;
    accountRole?: string;
    liabilityType?: string;
    currentBalance?: string;
}

/**
 * Planned Firefly transaction. Dry-run only — never POSTed from this shape yet.
 */
export interface PlannedFireflyTransaction {
    smsId: number;
    type: "withdrawal" | "deposit" | "transfer";
    amount: string;
    date: string;
    description: string;
    sourceId?: string;
    destinationId?: string;
    sourceName?: string;
    destinationName?: string;
    /** Firefly category (created on POST if missing). Withdrawals only. */
    categoryName?: string;
    externalId: string;
}

/**
 * One event either maps to a Firefly payload or is blocked.
 */
export type FireflyDryRunRow =
    | { ok: true; plan: PlannedFireflyTransaction }
    | { ok: false; smsId: number; kind: string; amount: number; reason: string; skip?: boolean };

/**
 * Payload to create one Firefly asset account.
 */
export interface FireflyAccountCreate {
    name: string;
    accountNumber: string;
    openingBalance: string;
    openingBalanceDate: string;
    accountRole: "defaultAsset" | "savingAsset";
    notes?: string;
}
