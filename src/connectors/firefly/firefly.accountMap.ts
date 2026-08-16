import { KnownAccount } from "../../classifiers/financial/knownAccount.model";
import { FireflyAccount } from "./firefly.types";

/**
 * Last 4 digits from a Firefly account_number field.
 *
 * @param accountNumber - Firefly account_number (last4 or a longer number)
 */
export function extractFireflyAccountLast4(
    accountNumber: string | undefined
): string | undefined {
    const digits = (accountNumber ?? "").replace(/\D/g, "");

    if (digits.length < 4) {
        return undefined;
    }

    return digits.slice(-4);
}

/**
 * Indexes Firefly ledger accounts by last4. Duplicate last4s are conflicts.
 */
export class FireflyLast4Index {
    private readonly byLast4 = new Map<string, FireflyAccount[]>();

    /**
     * @param accounts - Firefly asset + liability accounts
     */
    constructor(accounts: FireflyAccount[]) {
        for (const account of accounts) {
            const last4 = extractFireflyAccountLast4(account.accountNumber);

            if (!last4) {
                continue;
            }

            const existing = this.byLast4.get(last4) ?? [];
            existing.push(account);
            this.byLast4.set(last4, existing);
        }
    }

    /**
     * Exact last4 match. Undefined when missing or duplicated in Firefly.
     *
     * @param last4 - Four-digit account token
     */
    resolve(last4: string): FireflyAccount | undefined {
        const matches = this.byLast4.get(last4) ?? [];

        return matches.length === 1 ? matches[0] : undefined;
    }

    /**
     * True when two or more Firefly accounts share this last4.
     *
     * @param last4 - Four-digit account token
     */
    isConflict(last4: string): boolean {
        return (this.byLast4.get(last4) ?? []).length > 1;
    }

    /**
     * Firefly accounts that share a last4.
     *
     * @param last4 - Four-digit account token
     */
    conflicts(last4: string): FireflyAccount[] {
        const matches = this.byLast4.get(last4) ?? [];

        return matches.length > 1 ? matches : [];
    }
}

export interface OwnedFireflyMapRow {
    owned: KnownAccount;
    firefly?: FireflyAccount;
    status: "mapped" | "missing" | "conflict";
}

/**
 * Joins Narada owned last4s to Firefly accounts.
 *
 * @param owned - Local accounts.local.json rows
 * @param firefly - Firefly last4 index
 */
export function mapOwnedToFirefly(
    owned: KnownAccount[],
    firefly: FireflyLast4Index
): OwnedFireflyMapRow[] {
    return owned.map((account) => {
        if (firefly.isConflict(account.last4)) {
            return { owned: account, status: "conflict" as const };
        }

        const match = firefly.resolve(account.last4);

        if (!match) {
            return { owned: account, status: "missing" as const };
        }

        return { owned: account, firefly: match, status: "mapped" as const };
    });
}

/**
 * Firefly ledger accounts whose last4 is not in the owned list.
 *
 * @param accounts - Firefly asset + liability accounts
 * @param ownedLast4s - Narada last4 set
 */
export function extraFireflyAccounts(
    accounts: FireflyAccount[],
    ownedLast4s: Set<string>
): FireflyAccount[] {
    return accounts.filter((account) => {
        const last4 = extractFireflyAccountLast4(account.accountNumber);

        return !last4 || !ownedLast4s.has(last4);
    });
}
