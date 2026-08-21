import { FinancialEvent } from "../../classifiers/financial/financial.model";
import { KnownAccountIndex, loadKnownAccountIndex } from "../../classifiers/financial/knownAccounts";
import { FireflyLast4Index } from "./firefly.accountMap";
import { loadFireflyClient } from "./firefly.client";
import { planFireflyTransaction } from "./firefly.dryRun";
import { FireflyOpenings, loadFireflyOpenings } from "./firefly.openings";
import { FireflyDryRunRow } from "./firefly.types";

/** Why an unpushed event is not ready for Dhan. */
export type PushExceptionStatus = "blocked" | "skipped";

/**
 * Posted event that dry-run will not POST.
 */
export interface PushException {
    event: FinancialEvent;
    status: PushExceptionStatus;
    reason: string;
}

/**
 * Returns a push exception when the event is unpushed and dry-run is not ready.
 *
 * @param event - Row from financial_events
 * @param row - planFireflyTransaction result
 */
export function toPushException(
    event: FinancialEvent,
    row: FireflyDryRunRow
): PushException | undefined {
    if (event.fireflyTransactionId) {
        return undefined;
    }

    if (row.ok) {
        return undefined;
    }

    return {
        event,
        status: row.skip ? "skipped" : "blocked",
        reason: row.reason,
    };
}

/**
 * Dry-runs unpushed events and keeps blocked / skipped rows.
 *
 * @param events - Posted events (already unpushed)
 * @param firefly - Dhan last4 index
 * @param owned - Local owned accounts
 * @param openings - Ledger opening dates
 */
export function collectPushExceptions(
    events: FinancialEvent[],
    firefly: FireflyLast4Index,
    owned: KnownAccountIndex,
    openings: FireflyOpenings
): PushException[] {
    const exceptions: PushException[] = [];

    for (const event of events) {
        const row = planFireflyTransaction(event, firefly, owned, openings);
        const exception = toPushException(event, row);

        if (exception) {
            exceptions.push(exception);
        }
    }

    return exceptions;
}

/** Inputs needed to dry-run push exceptions. */
export interface ExceptionPlanner {
    firefly: FireflyLast4Index;
    owned: KnownAccountIndex;
    openings: FireflyOpenings;
}

const PLANNER_TTL_MS = 60_000;
let plannerCache: { expiresAt: number; planner: ExceptionPlanner } | undefined;

/**
 * Loads owned accounts, openings, and Dhan last4s. Cached briefly.
 */
export async function loadExceptionPlanner(): Promise<ExceptionPlanner> {
    if (plannerCache && plannerCache.expiresAt > Date.now()) {
        return plannerCache.planner;
    }

    const owned = loadKnownAccountIndex();
    const firefly = new FireflyLast4Index(await loadFireflyClient().listLedgerAccounts());
    const planner: ExceptionPlanner = {
        firefly,
        owned,
        openings: loadFireflyOpenings(owned.all().map((account) => account.last4)),
    };

    plannerCache = { expiresAt: Date.now() + PLANNER_TTL_MS, planner };
    return planner;
}

/**
 * True when FIREFLY_URL and FIREFLY_TOKEN are set.
 */
export function isFireflyConfigured(): boolean {
    return Boolean(process.env.FIREFLY_URL?.trim() && process.env.FIREFLY_TOKEN?.trim());
}
