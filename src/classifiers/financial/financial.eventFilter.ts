import { FinancialEvent } from "./financial.model";
import {
    isSameVpaTransfer,
    resolveOwnedTransferToken,
    selfTransferLast4s,
} from "./financial.kind";

/**
 * A posted event plus the SMS body used to decide persist vs skip.
 */
export interface EventFilterSource {
    event: FinancialEvent;
    body: string;
}

/**
 * Live owned last4s named as debit and credit in a self-transfer SMS.
 */
export interface OwnedTransferPair {
    debitLast4: string;
    creditLast4: string;
}

/**
 * Returns the owned debit/credit last4s when both legs resolve.
 *
 * @param body - SMS body
 */
export function ownedTransferPair(body: string): OwnedTransferPair | undefined {
    const last4s = selfTransferLast4s(body.toUpperCase());

    if (!last4s) {
        return undefined;
    }

    const debit = resolveOwnedTransferToken(last4s.debit);
    const credit = resolveOwnedTransferToken(last4s.credit);

    if (!debit || !credit) {
        return undefined;
    }

    return { debitLast4: debit.last4, creditLast4: credit.last4 };
}

/**
 * Same-VPA UPI and any transfer with a closed/unowned leg stay out of financial_events.
 *
 * @param body - SMS body
 */
export function isPersistableTransfer(body: string): boolean {
    const upper = body.toUpperCase();

    if (isSameVpaTransfer(upper)) {
        return false;
    }

    return ownedTransferPair(upper) !== undefined;
}

/**
 * Drops same-VPA and closed-account transfers, then keeps one row per money
 * movement when two SMS describe the same owned-to-owned transfer.
 *
 * @param rows - Owned posted events with SMS bodies
 */
export function filterPostedEvents(rows: EventFilterSource[]): FinancialEvent[] {
    const eligible: EventFilterSource[] = [];

    for (const row of rows) {
        if (row.event.kind === "transfer" && !isPersistableTransfer(row.body)) {
            continue;
        }

        eligible.push(row);
    }

    return dedupeMovements(eligible).map(withTransferLegs);
}

/**
 * Debit last4 on the event, credit last4 as counterparty. Loan dest is still
 * a transfer: savings down, liability down — no other savings credit.
 *
 * @param row - Eligible posted event
 */
function withTransferLegs(row: EventFilterSource): FinancialEvent {
    if (row.event.kind !== "transfer") {
        return row.event;
    }

    const pair = ownedTransferPair(row.body);

    if (!pair) {
        return row.event;
    }

    return {
        ...row.event,
        accountLast4: pair.debitLast4,
        counterpartyLast4: pair.creditLast4,
    };
}

function dedupeMovements(rows: EventFilterSource[]): EventFilterSource[] {
    const transfers = rows
        .filter((row) => row.event.kind === "transfer")
        .sort((left, right) => left.event.smsId - right.event.smsId);
    const keptTransfers: EventFilterSource[] = [];
    const seenKeys = new Set<string>();
    const collisionKeys = new Set<string>();

    for (const row of transfers) {
        const keys = transferDedupeKeys(row);

        if (keys.some((key) => seenKeys.has(key))) {
            continue;
        }

        for (const key of keys) {
            seenKeys.add(key);
        }

        const pair = ownedTransferPair(row.body);
        const day = calendarDayIst(row.event.occurredAt);

        if (pair) {
            collisionKeys.add(collisionKey(day, row.event.amount, pair.debitLast4));
            collisionKeys.add(collisionKey(day, row.event.amount, pair.creditLast4));
        }

        keptTransfers.push(row);
    }

    const others = rows.filter((row) => {
        if (row.event.kind === "transfer") {
            return false;
        }

        if (row.event.kind !== "income" && row.event.kind !== "expense") {
            return true;
        }

        const last4 = row.event.accountLast4;

        if (!last4) {
            return true;
        }

        return !collisionKeys.has(
            collisionKey(calendarDayIst(row.event.occurredAt), row.event.amount, last4)
        );
    });

    return [...others, ...keptTransfers].sort((left, right) => {
        const byTime = left.event.occurredAt.getTime() - right.event.occurredAt.getTime();

        return byTime !== 0 ? byTime : left.event.smsId - right.event.smsId;
    });
}

function transferDedupeKeys(row: EventFilterSource): string[] {
    const keys: string[] = [];
    const ref = extractMovementRef(row.body);
    const pair = ownedTransferPair(row.body);
    const day = calendarDayIst(row.event.occurredAt);

    if (ref) {
        keys.push(`ref:${ref}`);
    }

    if (pair) {
        const legs = [pair.debitLast4, pair.creditLast4].sort().join("-");
        keys.push(`pair:${day}:${row.event.amount}:${legs}`);
    }

    return keys;
}

function extractMovementRef(body: string): string | undefined {
    const upper = body.toUpperCase();
    const impsRef = upper.match(/IMPS\s+REF(?:ERENCE)?\s+NO\.?\s*(\d{10,})/);

    if (impsRef) {
        return `IMPS:${impsRef[1]}`;
    }

    const impsColon = upper.match(/\bIMPS:(\d{10,})/);

    if (impsColon) {
        return `IMPS:${impsColon[1]}`;
    }

    const rrn = upper.match(/\bRRN:(\d{10,})/);

    if (rrn) {
        return `RRN:${rrn[1]}`;
    }

    const upi = upper.match(/\bUPI[:/](\d{10,})/);

    if (upi) {
        return `UPI:${upi[1]}`;
    }

    return undefined;
}

function calendarDayIst(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function collisionKey(day: string, amount: number, last4: string): string {
    return `${day}|${amount}|${last4}`;
}
