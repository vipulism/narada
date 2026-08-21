import { isDueReminder } from "./financial.kind";

/**
 * Min and total due parsed from a statement / reminder SMS.
 */
export interface DueAmounts {
    minDue?: number;
    totalDue?: number;
}

/**
 * Fields that identify one bill across repeated reminder SMS.
 */
export interface DueReminderIdentity {
    smsId: number;
    occurredAt: Date;
    dueDate: string | null;
    accountLast4: string | null;
    amount: number | null;
}

/**
 * True when an analysis row is a due reminder that never posts to the ledger.
 *
 * @param subcategory - sms_analysis.subcategory
 * @param cashFlow - extracted cashFlow
 * @param body - SMS body
 */
export function isDueKnowledgeRow(
    subcategory: string | null | undefined,
    cashFlow: string | undefined,
    body: string
): boolean {
    return subcategory === "bill" && cashFlow === "NEUTRAL" && isDueReminder(body.toUpperCase());
}

/**
 * Reads min due and total due labels. First unlabeled `amount` in the SMS is often min due.
 *
 * @param body - Raw SMS body
 */
export function parseDueAmounts(body: string): DueAmounts {
    return {
        minDue: firstAmount(body, MIN_DUE_REGEX),
        totalDue: firstAmount(body, TOTAL_DUE_REGEX),
    };
}

const MIN_DUE_REGEX =
    /min(?:imum)?(?:\s+(?:amt|amount))?\s+due(?:\s+is)?[^\d]{0,16}(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;

const TOTAL_DUE_REGEX =
    /total(?:\s+(?:amt|amount))?\s+due(?:\s+is)?[^\d]{0,16}(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;

function firstAmount(body: string, pattern: RegExp): number | undefined {
    const match = body.match(pattern);

    if (!match?.[1]) {
        return undefined;
    }

    const parsed = Number(match[1].replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * One bill cycle: last4 + due date + amount. Missing fields stay unique by SMS id
 * so unknown rows are not collapsed together.
 *
 * @param row - Due reminder identity
 */
export function dueReminderKey(
    row: Pick<DueReminderIdentity, "smsId" | "dueDate" | "accountLast4" | "amount">
): string {
    const last4 = row.accountLast4?.trim() ?? "";
    const dueDate = row.dueDate?.trim().slice(0, 10) ?? "";
    const amount =
        typeof row.amount === "number" && Number.isFinite(row.amount)
            ? row.amount.toFixed(2)
            : "";

    if (!last4 || !dueDate || !amount) {
        return `sms:${row.smsId}`;
    }

    return `due:${last4}|${dueDate}|${amount}`;
}

/**
 * Keeps the newest SMS for each due reminder key (latest `occurredAt`, then highest id).
 *
 * @param rows - Due reminders, possibly several SMS per bill
 */
export function keepLatestDueReminders<T extends DueReminderIdentity>(rows: T[]): T[] {
    const best = new Map<string, T>();

    for (const row of rows) {
        const key = dueReminderKey(row);
        const prior = best.get(key);

        if (!prior || isNewerDue(row, prior)) {
            best.set(key, row);
        }
    }

    return [...best.values()].sort((left, right) => {
        const byTime = occurredAtMs(right) - occurredAtMs(left);
        return byTime !== 0 ? byTime : right.smsId - left.smsId;
    });
}

function isNewerDue(row: DueReminderIdentity, prior: DueReminderIdentity): boolean {
    const byTime = occurredAtMs(row) - occurredAtMs(prior);

    if (byTime !== 0) {
        return byTime > 0;
    }

    return row.smsId > prior.smsId;
}

function occurredAtMs(row: DueReminderIdentity): number {
    const ms = row.occurredAt instanceof Date ? row.occurredAt.getTime() : new Date(row.occurredAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
}
