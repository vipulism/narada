import { CLASSIFIERS } from "../classifiers/classifier.registry";
import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
} from "../connectors/firefly/firefly.exceptions";
import { FinancialEventRepository } from "../db/repositories/financialEvent.repository";
import { SmsDueRepository } from "../importers/sms/smsDue.repository";
import { toDueKnowledgeItem } from "../server/knowledge.mapper";
import { AttentionAlertState, BlockedAlert, DueAlert } from "./attention.state";
import { TelegramNotifier } from "./telegram.notifier";

const DUE_CAP = 500;
const DIGEST_CAP = 8;

const state = new AttentionAlertState();
const dues = new SmsDueRepository();
const events = new FinancialEventRepository();
const telegram = new TelegramNotifier();

/**
 * Seeds on first run, then Telegrams new dues and new/repeated Firefly blocks.
 * Skipped (before opening) rows are ignored. No spend summaries.
 */
export async function runAttentionAlerts(): Promise<void> {
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
        console.info("Skip attention alerts: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
        return;
    }

    const currentDues = await loadDues();
    const currentBlocked = await loadBlocked();
    const delta = state.diff(currentDues, currentBlocked);

    if (delta.seeded) {
        console.info(
            `attention alerts seeded: dues=${currentDues.length} blocked=${currentBlocked.length}`
        );
        return;
    }

    const messages = [
        formatDueDigest("New due", delta.newDues),
        formatBlockedDigest("Firefly blocked", delta.newBlocked),
        formatBlockedDigest("Firefly still blocked", delta.repeatedBlocked),
    ].filter((text): text is string => Boolean(text));

    for (const text of messages) {
        try {
            await telegram.sendHtml(text);
        } catch (error) {
            console.error("Attention Telegram failed", error);
        }
    }
}

/**
 * Builds HTML for new due rows. Empty when there are none.
 *
 * @param title - Digest heading
 * @param rows - New due reminders
 */
export function formatDueDigest(title: string, rows: DueAlert[]): string | undefined {
    if (rows.length === 0) {
        return undefined;
    }

    const lines = rows.slice(0, DIGEST_CAP).map((row) => {
        const who = [row.bank, row.accountLast4 ? `…${row.accountLast4}` : undefined]
            .filter(Boolean)
            .join(" ");
        const when = row.dueDate ? `due ${row.dueDate}` : "due";
        const total = row.totalDue ?? row.amount;
        const min = row.minDue;
        const money = [
            total != null ? `₹${total}` : undefined,
            min != null ? `min ₹${min}` : undefined,
        ]
            .filter(Boolean)
            .join(" · ");

        return `• ${escapeHtml(who || `#${row.smsId}`)} — ${escapeHtml(when)}${money ? ` · ${escapeHtml(money)}` : ""}`;
    });

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

async function loadDues(): Promise<DueAlert[]> {
    const preferred = CLASSIFIERS[0];

    if (!preferred) {
        return [];
    }

    const result = await dues.list({
        page: 1,
        limit: DUE_CAP,
        classifier: preferred.name,
        classifierVersion: preferred.version,
    });

    return result.items.map((source) => {
        const item = toDueKnowledgeItem(source);

        if (item.type !== "due") {
            return {
                smsId: source.smsId,
                dueDate: null,
                amount: null,
                minDue: null,
                totalDue: null,
                bank: null,
                accountLast4: null,
            };
        }

        return {
            smsId: source.smsId,
            dueDate: item.payload.dueDate,
            amount: item.payload.amount,
            minDue: item.payload.minDue,
            totalDue: item.payload.totalDue,
            bank: item.payload.bank,
            accountLast4: item.payload.accountLast4,
        };
    });
}

async function loadBlocked(): Promise<BlockedAlert[]> {
    if (!isFireflyConfigured()) {
        return [];
    }

    try {
        const planner = await loadExceptionPlanner();
        const unpushed = await events.listUnpushed({});
        const exceptions = collectPushExceptions(
            unpushed,
            planner.firefly,
            planner.owned,
            planner.openings
        );

        return exceptions
            .filter((row) => row.status === "blocked")
            .map((row) => ({
                smsId: row.event.smsId,
                kind: row.event.kind,
                amount: row.event.amount,
                reason: row.reason,
            }));
    } catch (error) {
        console.error("Attention blocked dry-run failed", error);
        return [];
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
