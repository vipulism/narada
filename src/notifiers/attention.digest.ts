import { daysUntilDue, formatRemainingDays } from "../classifiers/financial/financial.due";
import { BlockedAlert, DueAlert } from "./attention.state";

const DIGEST_CAP = 8;

/** Dhan (Firefly) snapshot for the daily Telegram digest. */
export interface DhanDigestStatus {
    configured: boolean;
    reachable: boolean;
    blocked: number;
    lastPushedAt: Date | null;
    error?: string;
}

/**
 * Builds HTML for new due rows. Empty when there are none.
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
    if (rows.length === 0) {
        return undefined;
    }

    const lines = rows.slice(0, DIGEST_CAP).map((row) => formatDueLine(row, today));
    const extra = rows.length > DIGEST_CAP ? `\n… +${rows.length - DIGEST_CAP} more` : "";

    return `📬 <b>${escapeHtml(title)}</b> (${rows.length})\n${lines.join("\n")}${extra}`;
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
 * Morning unpaid-dues list plus Dhan reachability / blocked / last push.
 *
 * @param dues - Unpaid due reminders (paid already filtered)
 * @param dhan - Firefly status
 * @param today - `YYYY-MM-DD` IST
 */
export function formatDailyAttentionDigest(
    dues: DueAlert[],
    dhan: DhanDigestStatus,
    today: string
): string {
    const heading = `📅 <b>Daily attention</b> (${escapeHtml(today)})`;
    const dueBlock = formatDueDigest("Dues", dues, today) ?? "📬 <b>Dues</b>\n• nothing unpaid";

    return `${heading}\n\n${dueBlock}\n\n${formatDhanStatus(dhan)}`;
}

/**
 * One-line Dhan status for Telegram.
 *
 * @param status - Reachability, blocked count, last push
 */
export function formatDhanStatus(status: DhanDigestStatus): string {
    if (!status.configured) {
        return "📒 <b>Dhan</b>\n• not configured";
    }

    const last = status.lastPushedAt
        ? `last push ${formatIstStamp(status.lastPushedAt)}`
        : "no pushes yet";

    if (!status.reachable) {
        const detail = status.error ? ` — ${escapeHtml(truncate(status.error, 80))}` : "";
        return `📒 <b>Dhan</b>\n• unreachable${detail}\n• ${escapeHtml(last)}`;
    }

    const blocked = status.blocked === 0 ? "no blocked pushes" : `${status.blocked} blocked`;

    return `📒 <b>Dhan</b>\n• reachable · ${blocked} · ${escapeHtml(last)}`;
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

function formatIstStamp(at: Date): string {
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(at);
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
