import { isCreditCardPaymentAck, isDueReminder } from "./financial.kind";
import { DUE_DATE_REGEX, DUE_ON_ORDINAL_REGEX, PAYMENT_DUE_DATE_REGEX } from "./financial.regex";

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
    /** Canonical biller when last4 would split the same household bill. */
    dueParty?: string | null;
    merchant?: string | null;
    body?: string | null;
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

const MONTHS: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
};

/**
 * Bill due date from reminder wording (`YYYY-MM-DD`), including SBI `Payable by 27/08/2026`.
 * `is due today` uses the SMS calendar day in IST. Statement `dated …` is not a due date.
 *
 * @param body - Raw SMS body
 * @param occurredAt - SMS received time; required for `is due today`
 */
export function parseDueDate(body: string, occurredAt?: Date): string | null {
    const labeled = body.match(DUE_DATE_REGEX)?.[1] ?? body.match(PAYMENT_DUE_DATE_REGEX)?.[1];

    if (labeled) {
        return normalizeDueDateToken(labeled);
    }

    const ordinal = body.match(DUE_ON_ORDINAL_REGEX)?.[1];
    if (ordinal) {
        return normalizeOrdinalDueDate(ordinal);
    }

    if (/\bis due today\b/i.test(body) && occurredAt) {
        return todayIstDate(occurredAt);
    }

    return null;
}

function normalizeDueDateToken(value: string): string | null {
    const monthName = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);

    if (monthName) {
        const month = MONTHS[monthName[2].toUpperCase()];
        if (!month) {
            return null;
        }

        return `${normalizeYear(monthName[3])}-${month}-${monthName[1].padStart(2, "0")}`;
    }

    const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

    if (!numeric) {
        return null;
    }

    return `${normalizeYear(numeric[3])}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
}

function normalizeOrdinalDueDate(value: string): string | null {
    const match = value.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{2,4})$/i);

    if (!match) {
        return null;
    }

    const month = MONTHS[match[2].slice(0, 3).toUpperCase()];

    if (!month) {
        return null;
    }

    return `${normalizeYear(match[3])}-${month}-${match[1].padStart(2, "0")}`;
}

function normalizeYear(year: string): string {
    return year.length === 2 ? `20${year}` : year;
}

function firstAmount(body: string, pattern: RegExp): number | undefined {
    const match = body.match(pattern);

    if (!match?.[1]) {
        return undefined;
    }

    const parsed = Number(match[1].replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Amount the operator would pay: total due, else min due, else extracted amount.
 *
 * @param payload - Due knowledge amounts
 */
export function payableDueAmount(payload: {
    amount?: number | null;
    minDue?: number | null;
    totalDue?: number | null;
}): number | null {
    for (const value of [payload.totalDue, payload.minDue, payload.amount]) {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }

    return null;
}

/**
 * False when the SMS names a nil outstanding (₹0). Unknown amounts still list.
 *
 * @param payload - Due knowledge amounts
 */
export function hasPayableDueAmount(payload: {
    amount?: number | null;
    minDue?: number | null;
    totalDue?: number | null;
}): boolean {
    const payable = payableDueAmount(payload);
    return payable === null || payable > 0;
}

/**
 * Visible card last4 from common issuer phrasing.
 *
 * @param body - SMS body
 */
export function cardLast4FromBody(body: string): string | null {
    const upper = body.toUpperCase();
    const match =
        upper.match(/ENDING(?:\s+WITH)?\s+(?:X{2,4}-)?(\d{4})\b/) ??
        upper.match(/\bXXXX-(\d{4})\b/) ??
        upper.match(/\bXX(\d{4})\b/);

    return match?.[1] ?? null;
}

/**
 * Same utility biller across SMS wording (Airtel WiFi vs Fixedline).
 *
 * @param merchant - Extracted merchant if any
 * @param body - Raw SMS body
 */
export function dueBillerAlias(
    merchant?: string | null,
    body?: string | null
): string | null {
    const text = [merchant, body]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" ")
        .toUpperCase()
        .replace(/WI-FI/g, "WIFI")
        .replace(/WI FI/g, "WIFI");

    if (!text) {
        return null;
    }

    const isAirtelBroadband =
        text.includes("AIRTEL") &&
        (text.includes("WIFI") ||
            text.includes("FIXEDLINE") ||
            text.includes("FIXED LINE") ||
            text.includes("BROADBAND") ||
            text.includes("XSTREAM"));

    return isAirtelBroadband ? "airtel-broadband" : null;
}

/**
 * One bill cycle: last4 or utility biller, plus due date or SMS month, plus amount.
 * Airtel WiFi and Fixedline collapse. July ₹589 and August ₹589 stay two cycles.
 * Missing last4/biller or amount stay unique by SMS id.
 *
 * @param row - Due reminder identity
 */
export function dueReminderKey(
    row: Pick<
        DueReminderIdentity,
        | "smsId"
        | "occurredAt"
        | "dueDate"
        | "accountLast4"
        | "amount"
        | "dueParty"
        | "merchant"
        | "body"
    >
): string {
    const amount =
        typeof row.amount === "number" && Number.isFinite(row.amount)
            ? row.amount.toFixed(2)
            : "";
    const biller = dueBillerAlias(row.merchant, row.body) ?? row.dueParty?.trim() ?? "";
    const last4 = row.accountLast4?.trim() ?? "";
    const party = biller || last4;
    const cycle = dueCycleBucket(row);

    if (!party || !amount) {
        return `sms:${row.smsId}`;
    }

    return `due:${party}|${cycle}|${amount}`;
}

function dueCycleBucket(
    row: Pick<DueReminderIdentity, "dueDate" | "occurredAt">
): string {
    const due = row.dueDate?.trim().slice(0, 10);
    if (due) {
        return due;
    }

    if (row.occurredAt) {
        return todayIstDate(
            row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt)
        ).slice(0, 7);
    }

    return "*";
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
 * Marks each due paid when a received/credited SMS hits the same last4
 * in that bill cycle. Prefer the due whose amount matches, then the closest
 * reminder time, so an older open cycle does not steal a later payment.
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

        for (const payment of sortedPays) {
            const candidates = sortedDues.filter(
                (due) => !used.has(due.smsId) && paymentFitsDue(due, payment, sortedDues)
            );

            if (candidates.length === 0) {
                continue;
            }

            candidates.sort((left, right) => comparePaymentFit(payment, left, right));
            used.add(candidates[0].smsId);
            status.set(candidates[0].smsId, "paid");
        }

        for (const due of sortedDues) {
            if (!status.has(due.smsId)) {
                status.set(due.smsId, statusFromDueDate(due.dueDate, today));
            }
        }
    }

    return status;
}

function dueDay(dueDate: string | null | undefined): string {
    return dueDate?.trim().slice(0, 10) ?? "";
}

function paymentFitsDue(
    due: DueReminderIdentity,
    payment: CardPaymentAck,
    orderedDues: DueReminderIdentity[]
): boolean {
    const payAt = occurredAtMs(payment);
    const reminded = firstRemindedMs(due);
    const cycleEnd = dueCycleEndMs(due);
    const windowStart = reminded - 2 * MS_DAY;

    if (amountDistance(payment, due) <= 1) {
        return payAt >= windowStart && payAt <= cycleEnd;
    }

    const index = orderedDues.indexOf(due);
    const next = orderedDues[index + 1];
    const nextStart = next ? firstRemindedMs(next) : Number.POSITIVE_INFINITY;
    const windowEnd = Math.min(nextStart, cycleEnd);

    return payAt >= windowStart && payAt <= windowEnd;
}

function comparePaymentFit(
    payment: CardPaymentAck,
    left: DueReminderIdentity,
    right: DueReminderIdentity
): number {
    const byAmount = amountDistance(payment, left) - amountDistance(payment, right);

    if (byAmount !== 0) {
        return byAmount;
    }

    const payAt = occurredAtMs(payment);
    const leftIssued = firstRemindedMs(left) <= payAt ? 0 : 1;
    const rightIssued = firstRemindedMs(right) <= payAt ? 0 : 1;

    if (leftIssued !== rightIssued) {
        return leftIssued - rightIssued;
    }

    return firstRemindedMs(left) - firstRemindedMs(right);
}

function amountDistance(payment: CardPaymentAck, due: DueReminderIdentity): number {
    if (payment.amount == null || due.amount == null) {
        return 1_000_000;
    }

    return Math.abs(payment.amount - due.amount);
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
