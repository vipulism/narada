import {
    daysUntilDue,
    formatRemainingDays,
    isUnpaidDueAttention,
} from "../classifiers/financial/financial.due";
import { BlockedAlert, DueAlert } from "./attention.state";

const DIGEST_CAP = 8;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** This-month vs last-month Dhan income/expense for the daily Telegram digest. */
export interface DhanMonthStats {
    configured: boolean;
    thisLabel: string;
    lastLabel: string;
    thisStart: string;
    thisEnd: string;
    lastStart: string;
    lastEnd: string;
    thisIncome?: number;
    thisExpense?: number;
    lastIncome?: number;
    lastExpense?: number;
    error?: string;
}

/**
 * Inclusive IST ranges: 1st→today vs the same days last month (clamped).
 *
 * @param today - `YYYY-MM-DD` in IST
 */
export function istComparableMonthRanges(today: string): {
    thisStart: string;
    thisEnd: string;
    lastStart: string;
    lastEnd: string;
    thisLabel: string;
    lastLabel: string;
} {
    const day = parseIsoDay(today);

    if (!day) {
        return {
            thisStart: today,
            thisEnd: today,
            lastStart: today,
            lastEnd: today,
            thisLabel: today,
            lastLabel: today,
        };
    }

    const thisStart = { year: day.year, month: day.month, day: 1 };
    const lastStart = addCalendarMonths(thisStart, -1);
    const lastEnd = addCalendarMonths(day, -1);

    return {
        thisStart: formatIsoDay(thisStart),
        thisEnd: formatIsoDay(day),
        lastStart: formatIsoDay(lastStart),
        lastEnd: formatIsoDay(lastEnd),
        thisLabel: `${MONTH_LABELS[day.month - 1]} ${thisStart.day}–${day.day}`,
        lastLabel: `${MONTH_LABELS[lastStart.month - 1]} ${lastStart.day}–${lastEnd.day}`,
    };
}

/**
 * Open + overdue rows only. Home mark-paid and payment-ack `paid` stay out.
 *
 * @param rows - Due alerts (may include paid)
 */
export function unpaidDueAlerts(rows: DueAlert[]): DueAlert[] {
    return rows.filter((row) => isUnpaidDueAttention(row.status));
}

/**
 * Builds HTML for new due rows. Empty when there are none.
 * Paid rows are omitted even if the caller forgot to filter.
 *
 * @param title - Digest heading
 * @param rows - New due reminders
 * @param today - `YYYY-MM-DD` IST (defaults to now)
 */
export function formatDueDigest(
    title: string,
    rows: DueAlert[],
    today?: string
): string | undefined {
    const unpaid = unpaidDueAlerts(rows);

    if (unpaid.length === 0) {
        return undefined;
    }

    const lines = unpaid.slice(0, DIGEST_CAP).map((row) => formatDueLine(row, today));
    const extra = unpaid.length > DIGEST_CAP ? `\n… +${unpaid.length - DIGEST_CAP} more` : "";

    return `📬 <b>${escapeHtml(title)}</b> (${unpaid.length})\n${lines.join("\n")}${extra}`;
}

/**
 * Builds HTML for blocked Firefly rows. Empty when there are none.
 *
 * @param title - Digest heading
 * @param rows - Blocked exceptions
 */
export function formatBlockedDigest(title: string, rows: BlockedAlert[]): string | undefined {
    if (rows.length === 0) {
        return undefined;
    }

    const lines = rows.slice(0, DIGEST_CAP).map((row) => {
        return `• #${row.smsId} ${escapeHtml(row.kind)} ₹${row.amount} — ${escapeHtml(row.reason)}`;
    });
    const extra = rows.length > DIGEST_CAP ? `\n… +${rows.length - DIGEST_CAP} more` : "";

    return `🚫 <b>${escapeHtml(title)}</b> (${rows.length})\n${lines.join("\n")}${extra}`;
}

/**
 * Morning unpaid-dues list plus Dhan this-month vs last-month income/expense.
 * Paid rows (Home mark or payment-ack) are omitted.
 *
 * @param dues - Due reminders; paid is stripped before send
 * @param dhan - Firefly month stats
 * @param today - `YYYY-MM-DD` IST
 */
export function formatDailyAttentionDigest(
    dues: DueAlert[],
    dhan: DhanMonthStats,
    today: string
): string {
    const heading = `📅 <b>Daily attention</b> (${escapeHtml(today)})`;
    const dueBlock = formatDueDigest("Dues", dues, today) ?? "📬 <b>Dues</b>\n• nothing unpaid";

    return `${heading}\n\n${dueBlock}\n\n${formatDhanMonthStats(dhan)}`;
}

/**
 * This month vs last month (same days) income and expenses from Dhan.
 *
 * @param stats - Loaded Firefly totals
 */
export function formatDhanMonthStats(stats: DhanMonthStats): string {
    if (!stats.configured) {
        return "📒 <b>Dhan</b>\n• not configured";
    }

    if (stats.error || stats.thisIncome == null || stats.thisExpense == null) {
        const detail = stats.error ? ` — ${escapeHtml(truncate(stats.error, 80))}` : "";
        return `📒 <b>Dhan</b>\n• unavailable${detail}`;
    }

    const lastIncome = stats.lastIncome ?? 0;
    const lastExpense = stats.lastExpense ?? 0;
    const thisLine = `• ${stats.thisLabel}: in ${formatInr(stats.thisIncome)} · out ${formatInr(stats.thisExpense)}`;
    const lastLine = `• ${stats.lastLabel}: in ${formatInr(lastIncome)} · out ${formatInr(lastExpense)}`;
    const incomeLine = `• ${monthOverMonthPhrase("income", stats.thisIncome, lastIncome)}`;
    const expenseLine = `• ${monthOverMonthPhrase("expenses", stats.thisExpense, lastExpense)}`;

    return `📒 <b>Dhan</b>\n${escapeHtml(thisLine)}\n${escapeHtml(lastLine)}\n${escapeHtml(incomeLine)}\n${escapeHtml(
        expenseLine
    )}`;
}

/**
 * Human percent change vs last month. Null previous is treated as zero.
 *
 * @param noun - `income` or `expenses`
 * @param current - This-month total
 * @param previous - Same-days last month
 */
export function monthOverMonthPhrase(noun: string, current: number, previous: number): string {
    if (previous === 0 && current === 0) {
        return `${noun} same as last month`;
    }

    if (previous === 0) {
        return `${noun} ${formatInr(current)} this month (₹0 last month)`;
    }

    const pct = Math.round(((current - previous) / previous) * 100);

    if (pct === 0) {
        return `${noun} same as last month`;
    }

    if (pct > 0) {
        return `${noun} ${pct}% more than last month`;
    }

    return `${noun} ${Math.abs(pct)}% less than last month`;
}

function formatDueLine(row: DueAlert, today?: string): string {
    const who = row.accountLast4
        ? [row.bank, `…${row.accountLast4}`].filter(Boolean).join(" ")
        : [row.bank, row.merchant].filter(Boolean).join(" ");
    const remaining = row.dueDate ? formatRemainingDays(daysUntilDue(row.dueDate, today)) : null;
    const when = [
        row.dueDate ? `due ${row.dueDate}` : "due",
        remaining,
    ]
        .filter(Boolean)
        .join(" · ");
    const total = row.totalDue ?? row.amount;
    const min = row.minDue;
    const money = [
        total != null ? `₹${total}` : undefined,
        min != null ? `min ₹${min}` : undefined,
    ]
        .filter(Boolean)
        .join(" · ");

    return `• ${escapeHtml(who || `#${row.smsId}`)} — ${escapeHtml(when)}${
        money ? ` · ${escapeHtml(money)}` : ""
    }`;
}

function formatInr(amount: number): string {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function parseIsoDay(value: string): { year: number; month: number; day: number } | null {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return null;
    }

    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
}

function formatIsoDay(day: { year: number; month: number; day: number }): string {
    return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

function addCalendarMonths(
    day: { year: number; month: number; day: number },
    delta: number
): { year: number; month: number; day: number } {
    const monthIndex = day.year * 12 + (day.month - 1) + delta;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const last = lastDayOfMonth(year, month);

    return { year, month, day: Math.min(day.day, last) };
}

function lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function truncate(value: string, max: number): string {
    const trimmed = value.trim();
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
