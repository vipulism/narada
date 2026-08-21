import { isCreditCardPaymentAck, isDueReminder } from "./financial.kind";

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
    firstRemindedAt?: Date;
    dueDate: string | null;
    accountLast4: string | null;
    amount: number | null;
}

/** Attention state after matching card payment-ack SMS. */
export type DueAttentionStatus = "open" | "overdue" | "paid";

/** Issuer SMS that a payment was received / credited to a card last4. */
export interface CardPaymentAck {
    smsId: number;
    occurredAt: Date;
    accountLast4: string | null;
    amount: number | null;
}

/**
 * True when an analysis row is a due reminder that never posts to the ledger.
 * Credit-card payment received/credited SMS stay out of the due list.
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
    const upper = body.toUpperCase();
    return (
        subcategory === "bill" &&
        cashFlow === "NEUTRAL" &&
        isDueReminder(upper) &&
        !isCreditCardPaymentAck(upper)
    );
}

/**
 * True when an analysis row is a card payment received/credited ack (not a due).
 *
 * @param subcategory - sms_analysis.subcategory
 * @param cashFlow - extracted cashFlow
 * @param body - SMS body
 */
export function isCardPaymentAckRow(
    subcategory: string | null | undefined,
    cashFlow: string | undefined,
    body: string
): boolean {
    const upper = body.toUpperCase();
    return subcategory === "bill" && cashFlow === "NEUTRAL" && isCreditCardPaymentAck(upper);
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
        const firstRemindedAt = new Date(
            Math.min(firstRemindedMs(row), prior ? firstRemindedMs(prior) : Number.POSITIVE_INFINITY)
        );

        if (!prior || isNewerDue(row, prior)) {
            best.set(key, { ...row, firstRemindedAt });
        } else {
            best.set(key, { ...prior, firstRemindedAt });
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

function occurredAtMs(row: { occurredAt: Date }): number {
    const ms = row.occurredAt instanceof Date ? row.occurredAt.getTime() : new Date(row.occurredAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function firstRemindedMs(row: DueReminderIdentity): number {
    if (row.firstRemindedAt) {
        const ms =
            row.firstRemindedAt instanceof Date
                ? row.firstRemindedAt.getTime()
                : new Date(row.firstRemindedAt).getTime();
        if (Number.isFinite(ms)) {
            return ms;
        }
    }

    return occurredAtMs(row);
}

const MS_DAY = 86_400_000;
const PAID_GRACE_DAYS = 25;

/**
 * Calendar date in India (`YYYY-MM-DD`) for overdue vs open.
 *
 * @param now - Instant to format
 */
export function todayIstDate(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

/**
 * Marks each due paid when a later received/credited SMS hits the same last4
 * in that bill cycle. Otherwise overdue when due date is before today (IST).
 *
 * @param dues - Unique due reminders
 * @param payments - Card payment-ack SMS
 * @param today - `YYYY-MM-DD` (defaults to today IST)
 */
export function settleDueStatuses(
    dues: DueReminderIdentity[],
    payments: CardPaymentAck[],
    today: string = todayIstDate()
): Map<number, DueAttentionStatus> {
    const status = new Map<number, DueAttentionStatus>();
    const duesByLast4 = new Map<string, DueReminderIdentity[]>();

    for (const due of dues) {
        const last4 = due.accountLast4?.trim() ?? "";

        if (!last4) {
            status.set(due.smsId, statusFromDueDate(due.dueDate, today));
            continue;
        }

        const group = duesByLast4.get(last4) ?? [];
        group.push(due);
        duesByLast4.set(last4, group);
    }

    const paysByLast4 = new Map<string, CardPaymentAck[]>();

    for (const payment of payments) {
        const last4 = payment.accountLast4?.trim() ?? "";

        if (!last4) {
            continue;
        }

        const group = paysByLast4.get(last4) ?? [];
        group.push(payment);
        paysByLast4.set(last4, group);
    }

    for (const [last4, cardDues] of duesByLast4) {
        const sortedDues = [...cardDues].sort((left, right) => {
            const byDate = dueDay(left.dueDate).localeCompare(dueDay(right.dueDate));
            if (byDate !== 0) {
                return byDate;
            }

            return firstRemindedMs(left) - firstRemindedMs(right);
        });
        const sortedPays = [...(paysByLast4.get(last4) ?? [])].sort(
            (left, right) => occurredAtMs(left) - occurredAtMs(right)
        );
        const used = new Set<number>();

        for (let index = 0; index < sortedDues.length; index += 1) {
            const due = sortedDues[index];
            const next = sortedDues[index + 1];
            const windowStart = firstRemindedMs(due) - 2 * MS_DAY;
            const nextStart = next ? firstRemindedMs(next) : Number.POSITIVE_INFINITY;
            const cycleEnd = dueCycleEndMs(due);
            const windowEnd = Math.min(nextStart, cycleEnd);

            const payment = sortedPays.find(
                (row) =>
                    !used.has(row.smsId) &&
                    occurredAtMs(row) >= windowStart &&
                    occurredAtMs(row) < windowEnd
            );

            if (payment) {
                used.add(payment.smsId);
                status.set(due.smsId, "paid");
            } else {
                status.set(due.smsId, statusFromDueDate(due.dueDate, today));
            }
        }
    }

    return status;
}

function dueDay(dueDate: string | null | undefined): string {
    return dueDate?.trim().slice(0, 10) ?? "";
}

function statusFromDueDate(dueDate: string | null, today: string): DueAttentionStatus {
    const day = dueDay(dueDate);
    return day && day < today ? "overdue" : "open";
}

function dueCycleEndMs(due: DueReminderIdentity): number {
    const day = dueDay(due.dueDate);

    if (day) {
        const end = Date.parse(`${day}T00:00:00+05:30`) + PAID_GRACE_DAYS * MS_DAY;
        if (Number.isFinite(end)) {
            return end;
        }
    }

    return firstRemindedMs(due) + 40 * MS_DAY;
}
