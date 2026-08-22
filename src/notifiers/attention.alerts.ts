import { todayIstDate } from "../classifiers/financial/financial.due";
import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
} from "../connectors/firefly/firefly.exceptions";
import { loadFireflyClient } from "../connectors/firefly/firefly.client";
import { FinancialEventRepository } from "../db/repositories/financialEvent.repository";
import { MerchantCategoryRepository } from "../db/repositories/merchantCategory.repository";
import { SmsSpendOverrideRepository } from "../db/repositories/smsSpendOverride.repository";
import { MerchantAliasRepository } from "../db/repositories/merchantAlias.repository";
import { loadSettledDueKnowledge } from "../server/due.feed";
import {
    formatBlockedDigest,
    formatDailyAttentionDigest,
    formatDueDigest,
    istComparableMonthRanges,
    istInclusiveBounds,
    type DhanMonthStats,
} from "./attention.digest";
import { buildSpendMonthStats, type SpendMonthStats } from "../classifiers/financial/financial.spend";
import { AttentionAlertState, BlockedAlert, DueAlert } from "./attention.state";
import { TelegramNotifier } from "./telegram.notifier";

const state = new AttentionAlertState();
const events = new FinancialEventRepository();
const merchantCategories = new MerchantCategoryRepository();
const smsSpendOverrides = new SmsSpendOverrideRepository();
const merchantAliases = new MerchantAliasRepository();
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
 * Sends today's unpaid dues (open + overdue), Dhan income/expense, and SMS spend buckets.
 * Home mark-paid and payment-ack cycles are omitted.
 * Runs at 08:00 IST. Does not replace the new-due / blocked delta pings.
 */
export async function runDailyAttentionDigest(): Promise<void> {
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim() || !process.env.TELEGRAM_CHAT_ID?.trim()) {
        console.info("Skip daily attention digest: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing");
        return;
    }

    try {
        const today = todayIstDate();
        const [dues, dhan, spend] = await Promise.all([
            loadDues(),
            loadDhanMonthStats(today),
            loadSpendMonthStats(today),
        ]);
        await telegram.sendHtml(formatDailyAttentionDigest(dues, dhan, today, spend));
        console.info(
            `daily attention digest sent: dues=${dues.length} dhan=${dhan.error ? "down" : "ok"} spend=${spend.buckets.length}`
        );
    } catch (error) {
        console.error("Daily attention digest failed", error);
    }
}

async function loadDues(): Promise<DueAlert[]> {
    const items = await loadSettledDueKnowledge({ status: "unpaid" });

    return items.flatMap((item) => {
        if (item.type !== "due" || item.payload.status === "paid") {
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
                status: item.payload.status === "overdue" ? "overdue" : "open",
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

async function loadDhanMonthStats(today: string): Promise<DhanMonthStats> {
    const ranges = istComparableMonthRanges(today);

    if (!isFireflyConfigured()) {
        return { configured: false, ...ranges };
    }

    try {
        const client = loadFireflyClient();
        const [thisIncome, thisExpense, lastIncome, lastExpense] = await Promise.all([
            client.insightTotal("income", ranges.thisStart, ranges.thisEnd),
            client.insightTotal("expense", ranges.thisStart, ranges.thisEnd),
            client.insightTotal("income", ranges.lastStart, ranges.lastEnd),
            client.insightTotal("expense", ranges.lastStart, ranges.lastEnd),
        ]);

        return {
            configured: true,
            ...ranges,
            thisIncome,
            thisExpense,
            lastIncome,
            lastExpense,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Dhan insight failed";

        return {
            configured: true,
            ...ranges,
            error: message,
        };
    }
}

async function loadSpendMonthStats(today: string): Promise<SpendMonthStats> {
    const ranges = istComparableMonthRanges(today);
    const thisBounds = istInclusiveBounds(ranges.thisStart, ranges.thisEnd);
    const lastBounds = istInclusiveBounds(ranges.lastStart, ranges.lastEnd);
    const [thisRows, lastRows, assigned, overrides, aliases] = await Promise.all([
        events.listExpensesInRange(thisBounds.from, thisBounds.to),
        events.listExpensesInRange(lastBounds.from, lastBounds.to),
        merchantCategories.listBucketMap(),
        smsSpendOverrides.listAll(),
        merchantAliases.listAll(),
    ]);

    return buildSpendMonthStats(
        thisRows,
        lastRows,
        ranges.thisLabel,
        ranges.lastLabel,
        assigned,
        overrides,
        aliases
    );
}
