import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FireflyAccount, FireflyAccountCreate } from "./firefly.types";
import { extractFireflyAccountLast4 } from "./firefly.accountMap";

interface DhanSeedFile {
    openOn?: string;
    accounts?: DhanSeedAccount[];
}

interface DhanSeedAccount {
    name?: string;
    last4?: string;
    openingBalance?: number;
    accountRole?: "defaultAsset" | "savingAsset";
    notes?: string;
}

/**
 * One normalized row from the seed JSON.
 */
export interface DhanSeedRow {
    name: string;
    last4: string;
    openingBalance: number;
    accountRole?: "defaultAsset" | "savingAsset";
    notes?: string;
}

/**
 * Loaded seed file.
 */
export interface DhanSeedFileLoaded {
    openOn: string;
    accounts: DhanSeedRow[];
}

/**
 * One seed row: create, skip (already in Dhan), or invalid JSON.
 */
export type FireflySeedPlan =
    | { action: "create"; plan: FireflyAccountCreate }
    | { action: "skip"; name: string; reason: string }
    | { action: "invalid"; name: string; reason: string };

/**
 * Loads gitignored Dhan seed JSON. Missing file is an error.
 *
 * @param filePath - Path to dhan-accounts.local.json
 */
export function loadDhanSeedFile(filePath = "config/dhan-accounts.local.json"): DhanSeedFileLoaded {
    const resolved = resolve(filePath);

    if (!existsSync(resolved)) {
        throw new Error(
            `Missing ${filePath}. Copy config/dhan-accounts.example.json and fill opening balances.`
        );
    }

    const parsed = JSON.parse(readFileSync(resolved, "utf8")) as DhanSeedFile;
    const openOn = parsed.openOn?.trim() ?? "2026-08-16";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(openOn)) {
        throw new Error(`Invalid openOn ${openOn}; expected YYYY-MM-DD`);
    }

    const accounts = (parsed.accounts ?? []).map((account) => ({
        name: String(account.name ?? "").trim(),
        last4: String(account.last4 ?? "").replace(/\D/g, ""),
        openingBalance: Number(account.openingBalance),
        accountRole: account.accountRole,
        notes: account.notes?.trim(),
    }));

    return { openOn, accounts };
}

/**
 * Plans creates vs skips against accounts already in Firefly.
 *
 * @param seed - Local JSON rows
 * @param existing - Firefly asset + liability accounts
 * @param openOn - Opening balance date (Asia/Kolkata calendar day)
 */
export function planFireflyAccountSeed(
    seed: DhanSeedRow[],
    existing: FireflyAccount[],
    openOn: string
): FireflySeedPlan[] {
    const names = new Set(existing.map((account) => account.name.trim().toLowerCase()));
    const last4s = new Set(
        existing
            .map((account) => extractFireflyAccountLast4(account.accountNumber))
            .filter((value): value is string => Boolean(value))
    );

    return seed.map((row) => {
        if (!row.name) {
            return { action: "invalid" as const, name: "-", reason: "missing name" };
        }

        if (!/^\d{4}$/.test(row.last4)) {
            return { action: "invalid" as const, name: row.name, reason: "last4 must be 4 digits" };
        }

        if (!Number.isFinite(row.openingBalance) || row.openingBalance < 0) {
            return {
                action: "invalid" as const,
                name: row.name,
                reason: "openingBalance must be a number >= 0",
            };
        }

        if (names.has(row.name.toLowerCase())) {
            return { action: "skip" as const, name: row.name, reason: "name already exists in Dhan" };
        }

        if (last4s.has(row.last4)) {
            return {
                action: "skip" as const,
                name: row.name,
                reason: `last4 ${row.last4} already exists in Dhan`,
            };
        }

        names.add(row.name.toLowerCase());
        last4s.add(row.last4);

        return {
            action: "create" as const,
            plan: {
                name: row.name,
                accountNumber: row.last4,
                openingBalance: row.openingBalance.toFixed(2),
                openingBalanceDate: openOn,
                accountRole: row.accountRole ?? "defaultAsset",
                notes: row.notes,
            },
        };
    });
}
