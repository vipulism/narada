import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
} from "../connectors/firefly/firefly.exceptions";
import { loadFireflyClient } from "../connectors/firefly/firefly.client";
import { FinancialEventRepository } from "../db/repositories/financialEvent.repository";
import { todayIstDate } from "../classifiers/financial/financial.due";
import { loadSettledDueKnowledge } from "../server/due.feed";
import { AttentionAlertState, BlockedAlert, DueAlert } from "./attention.state";
import {
    formatBlockedDigest,
    formatDailyAttentionDigest,
    formatDueDigest,
    type DhanDigestStatus,
} from "./attention.digest";
import { TelegramNotifier } from "./telegram.notifier";

const state = new AttentionAlertState();
const events = new FinancialEventRepository();
const telegram = new TelegramNotifier();

export { formatBlockedDigest, formatDailyAttentionDigest, formatDueDigest };

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
 * Sends today's unpaid dues (due date + remaining days) and Dhan push status.
 * Runs at 08:00 IST. Does not replace the new-due / blocked delta pings.
 */
export async function runDailyAttentionDigest(): Promise<void> {
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
        console.info("Skip daily attention digest: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
        return;
    }

    try {
        const today = todayIstDate();
        const [dues, dhan] = await Promise.all([loadDues(), loadDhanStatus()]);
        await telegram.sendHtml(formatDailyAttentionDigest(dues, dhan, today));
        console.info(
            `daily attention digest sent: dues=${dues.length} dhan=${dhan.reachable ? "ok" : "down"}`
        );
    } catch (error) {
        console.error("Daily attention digest failed", error);
    }
}

async function loadDues(): Promise<DueAlert[]> {
    const items = await loadSettledDueKnowledge();

    return items.flatMap((item) => {
        if (item.type !== "due") {
            return [];
        }

        return [
            {
                smsId: item.id,
                occurredAt:
                    item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt),
                dueDate: item.payload.dueDate,
                amount: item.payload.amount,
                minDue: item.payload.minDue,
                totalDue: item.payload.totalDue,
                bank: item.payload.bank,
                accountLast4: item.payload.accountLast4,
                merchant: item.payload.merchant,
                dueParty: item.payload.dueParty,
            },
        ];
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

async function loadDhanStatus(): Promise<DhanDigestStatus> {
    let lastPushedAt: Date | null = null;

    try {
        lastPushedAt = await events.latestFireflyPushAt();
    } catch (error) {
        console.error("Dhan last-push lookup failed", error);
    }

    if (!isFireflyConfigured()) {
        return { configured: false, reachable: false, blocked: 0, lastPushedAt };
    }

    try {
        await loadFireflyClient().ping();
        const blocked = await loadBlocked();

        return {
            configured: true,
            reachable: true,
            blocked: blocked.length,
            lastPushedAt,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Dhan ping failed";

        return {
            configured: true,
            reachable: false,
            blocked: 0,
            lastPushedAt,
            error: message,
        };
    }
}
