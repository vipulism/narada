import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { KnownAccount, KnownAccountsFile } from "./knownAccount.model";

/**
 * Matches an SMS account token (XX412, *1260, 1687) to a known last4.
 */
export class KnownAccountIndex {
    constructor(private readonly accounts: KnownAccount[]) {}

    /**
     * Resolves SMS account digits to an owned account.
     * Four digits → exact last4 only. Three digits → suffix match only when
     * the SMS itself had only three digits and the bank also matches.
     * Two digits are never resolved here (SBI ending 85 must not become 8561).
     *
     * @param digits - Numeric part from the SMS (e.g. 412 from XX412, or 1412)
     * @param bank - Bank from sender/body; required for a 3-digit suffix match
     * @returns The unique matching account, if any
     */
    resolve(digits: string, bank?: string): KnownAccount | undefined {
        const normalized = digits.replace(/\D/g, "");

        if (normalized.length === 4) {
            const exact = this.accounts.filter((account) => account.last4 === normalized);

            return exact.length === 1 ? exact[0] : undefined;
        }

        if (normalized.length !== 3 || !bank) {
            return undefined;
        }

        const bankName = bank.trim().toUpperCase();
        const suffix = this.accounts.filter(
            (account) =>
                account.bank.toUpperCase() === bankName &&
                account.last4.endsWith(normalized)
        );

        return suffix.length === 1 ? suffix[0] : undefined;
    }

    /**
     * Three visible digits, unique last4 suffix across all owned accounts.
     * Used only for the other account in a self-transfer SMS (XX412 debited,
     * XX424 credited). Primary SMS identity still requires last3 + same bank.
     *
     * @param digits - Three digits as they appear in the SMS
     */
    resolveUniqueSuffix(digits: string): KnownAccount | undefined {
        const normalized = digits.replace(/\D/g, "");

        if (normalized.length !== 3) {
            return undefined;
        }

        return this.uniqueMatch(
            this.accounts.filter((account) => account.last4.endsWith(normalized))
        );
    }

    /**
     * When SMS has no last4, use the bank only if this owner has exactly one account there.
     *
     * @param bank - Bank name from sender or body (e.g. HSBC)
     */
    resolveUniqueByBank(bank: string): KnownAccount | undefined {
        return this.uniqueMatch(
            this.accounts.filter(
                (account) => account.bank.toUpperCase() === bank.trim().toUpperCase()
            )
        );
    }

    /**
     * When SMS names a product (credit card) and this owner has exactly one of that type at the bank.
     *
     * @param bank - Bank name from sender or body
     * @param type - Account type mentioned in the SMS
     */
    resolveUniqueByBankAndType(
        bank: string,
        type: KnownAccount["type"]
    ): KnownAccount | undefined {
        return this.uniqueMatch(
            this.accounts.filter(
                (account) =>
                    account.bank.toUpperCase() === bank.trim().toUpperCase() &&
                    account.type === type
            )
        );
    }

    private uniqueMatch(matches: KnownAccount[]): KnownAccount | undefined {
        return matches.length === 1 ? matches[0] : undefined;
    }

    /**
     * Every owned account in the local config.
     */
    all(): KnownAccount[] {
        return [...this.accounts];
    }
}

/**
 * Loads gitignored local account list. Missing file is valid (no identity match).
 *
 * @returns Index of accounts the user owns
 */
export function loadKnownAccountIndex(): KnownAccountIndex {
    const configured = process.env.ACCOUNTS_CONFIG_PATH;
    const filePath = resolve(configured ?? "config/accounts.local.json");

    if (!existsSync(filePath)) {
        return new KnownAccountIndex([]);
    }

    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as KnownAccountsFile;
    const accounts = (parsed.accounts ?? []).filter((account) =>
        /^\d{4}$/.test(account.last4)
    );

    return new KnownAccountIndex(accounts);
}
