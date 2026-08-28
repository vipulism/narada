import {
    compareDueUrgency,
    daysUntilDue,
    formatRemainingDays,
    isUnpaidDueAttention,
} from "../classifiers/financial/financial.due";
import type { SpendMonthStats } from "../classifiers/financial/financial.spend";
import { DHAN_LEDGER_START } from "../connectors/firefly/firefly.openings";
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
 * True from 08:00 IST onward — the daily digest window.
 *
 * @param now - Instant to check
 */
export function isDailyDigestDue(now = new Date()): boolean {
    const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            hourCycle: "h23",
        }).format(now)
    );

    return Number.isFinite(hour) && hour >= 8;
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
 * Inclusive IST midnight bounds for a `YYYY-MM-DD` range.
 *
 * @param start - First day IST
 * @param end - Last day IST
 */
export function istInclusiveBounds(start: string, end: string): { from: Date; to: Date } {
    return {
        from: new Date(`${start}T00:00:00+05:30`),
        to: new Date(`${end}T23:59:59.999+05:30`),
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
    const unpaid = unpaidDueAlerts(rows).sort((left, right) =>
        compareDueUrgency(
            { dueDate: left.dueDate, status: left.status, smsId: left.smsId },
            { dueDate: right.dueDate, status: right.status, smsId: right.smsId },
            today
        )
    );

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
 * Morning unpaid-dues list plus Dhan totals and SMS spend buckets.
 * Paid rows (Home mark or payment-ack) are omitted.
 *
 * @param dues - Due reminders; paid is stripped before send
 * @param dhan - Firefly month stats
 * @param today - `YYYY-MM-DD` IST
 * @param spend - Optional SMS expense buckets vs last month
 */
export function formatDailyAttentionDigest(
    dues: DueAlert[],
    dhan: DhanMonthStats,
    today: string,
    spend?: SpendMonthStats
): string {
    const heading = `📅 <b>Daily attention</b> (${escapeHtml(today)})`;
    const dueBlock = formatDueDigest("Dues", dues, today) ?? "📬 <b>Dues</b>\n• nothing unpaid";
    const parts = [heading, dueBlock, formatDhanMonthStats(dhan)];
    const spendBlock = formatSpendMonthStats(spend);

    if (spendBlock) {
        parts.push(spendBlock);
    }

    return parts.join("\n\n");
}

/**
 * Grocery / shopping / merchant totals from Narada `financial_events` (not Dhan categories).
 *
 * @param stats - This vs last month spend
 */
export function formatSpendMonthStats(stats?: SpendMonthStats): string | undefined {
    if (!stats) {
        return undefined;
    }

    if (stats.buckets.length === 0) {
        return "🛒 <b>Spend</b>\n• no posted expenses this range";
    }

    const bucketLines = stats.buckets.map((row) => {
        const last =
            row.lastAmount > 0 ? ` · last ${formatInr(row.lastAmount)}` : " · ₹0 last month";
        return `• ${escapeHtml(row.label)} ${formatInr(row.thisAmount)}${escapeHtml(last)} · ${escapeHtml(
            spendDeltaPhrase(row.thisAmount, row.lastAmount)
        )}`;
    });

    const extra: string[] = [];
    if (stats.topMerchant) {
        extra.push(
            `• top ${escapeHtml(stats.topMerchant.label)} ${formatInr(stats.topMerchant.thisAmount)}` +
                (stats.topMerchant.lastAmount > 0
                    ? ` (last ${formatInr(stats.topMerchant.lastAmount)})`
                    : "")
        );
    }

    for (const row of stats.largeMerchants) {
        if (row.key === stats.topMerchant?.key) {
            continue;
        }
        extra.push(`• large ${escapeHtml(row.label)} ${formatInr(row.thisAmount)}`);
    }

    return `🛒 <b>Spend</b> (${escapeHtml(stats.thisLabel)} vs ${escapeHtml(stats.lastLabel)})\n${bucketLines.join(
        "\n"
    )}${extra.length ? `\n${extra.join("\n")}` : ""}`;
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

    const thisLine = `• ${stats.thisLabel}: in ${formatInr(stats.thisIncome)} · out ${formatInr(stats.thisExpense)}`;

    if (!dhanLastMonthComparable(stats.lastEnd)) {
        return `📒 <b>Dhan</b>\n${escapeHtml(thisLine)}\n${escapeHtml(
            `• ledger from ${formatIstDayLabel(DHAN_LEDGER_START)}`
        )}`;
    }

    const lastIncome = stats.lastIncome ?? 0;
    const lastExpense = stats.lastExpense ?? 0;
    const lastLine = `• ${stats.lastLabel}: in ${formatInr(lastIncome)} · out ${formatInr(lastExpense)}`;
    const incomeLine = `• ${monthOverMonthPhrase("income", stats.thisIncome, lastIncome)}`;
    const expenseLine = `• ${monthOverMonthPhrase("expenses", stats.thisExpense, lastExpense)}`;

    return `📒 <b>Dhan</b>\n${escapeHtml(thisLine)}\n${escapeHtml(lastLine)}\n${escapeHtml(incomeLine)}\n${escapeHtml(
        expenseLine
    )}`;
}

/**
 * Last-month Dhan totals are comparable only when that window reaches the ledger opening.
 *
 * @param lastEnd - Inclusive last day of the prior-month window (`YYYY-MM-DD`)
 * @param ledgerStart - Dhan opening day
 */
export function dhanLastMonthComparable(
    lastEnd: string,
    ledgerStart: string = DHAN_LEDGER_START
): boolean {
    return lastEnd >= ledgerStart;
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

function spendDeltaPhrase(current: number, previous: number): string {
    if (previous === 0) {
        return "new vs last month";
    }

    const pct = Math.round(((current - previous) / previous) * 100);

    if (pct === 0) {
        return "same as last month";
    }

    if (pct > 0) {
        return `${pct}% more than last month`;
    }

    return `${Math.abs(pct)}% less than last month`;
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

function formatIstDayLabel(iso: string): string {
    const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return iso;
    }

    return `${Number(match[3])} ${MONTH_LABELS[Number(match[2]) - 1]} ${match[1]}`;
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
