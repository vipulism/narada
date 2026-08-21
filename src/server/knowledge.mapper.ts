import {
    dueReminderKey,
    hasPayableDueAmount,
    isCardPaymentAckRow,
    isDueKnowledgeRow,
    keepLatestDueReminders,
    parseDueAmounts,
    settleDueStatuses,
    todayIstDate,
    type CardPaymentAck,
    type DueAttentionStatus,
} from "../classifiers/financial/financial.due";
import { FinancialEvent } from "../classifiers/financial/financial.model";
import type { PushException } from "../connectors/firefly/firefly.exceptions";
import type { DueAnalysisSource } from "../importers/sms/smsDue.repository";

/** Posted financial event as a knowledge envelope. */
export interface KnowledgeFinancialPayload {
    kind: string;
    cashFlow: string;
    amount: number;
    currency: string;
    accountLast4: string | null;
    counterpartyLast4: string | null;
    accountName: string | null;
    bank: string | null;
    merchant: string | null;
    transactionType: string | null;
    classifier: string;
    classifierVersion: string;
    fireflyTransactionId: string | null;
    fireflyPushedAt: Date | null;
}

/** Due reminder that never enters financial_events. */
export interface KnowledgeDuePayload {
    kind: "due";
    dueDate: string | null;
    minDue: number | null;
    totalDue: number | null;
    amount: number | null;
    currency: string | null;
    accountLast4: string | null;
    accountName: string | null;
    bank: string | null;
    merchant: string | null;
    classifier: string;
    classifierVersion: string;
    status?: DueAttentionStatus;
    markedPaid?: boolean;
}

/** Push dry-run failure for an unpushed posted event. */
export interface KnowledgeExceptionPayload {
    kind: string;
    amount: number;
    currency: string;
    accountLast4: string | null;
    counterpartyLast4: string | null;
    bank: string | null;
    merchant: string | null;
    status: "blocked" | "skipped";
    reason: string;
}

/** One knowledge item. `id` is `sms_messages.id` (stable across event rebuilds). */
export type KnowledgeItem =
    | {
          type: "financial";
          id: number;
          occurredAt: Date;
          payload: KnowledgeFinancialPayload;
      }
    | {
          type: "due";
          id: number;
          occurredAt: Date;
          payload: KnowledgeDuePayload;
      }
    | {
          type: "exception";
          id: number;
          occurredAt: Date;
          payload: KnowledgeExceptionPayload;
      };

/**
 * Wraps a posted financial event for GET /knowledge.
 *
 * @param event - Row from `financial_events`
 */
export function toKnowledgeItem(event: FinancialEvent): KnowledgeItem {
    return {
        type: "financial",
        id: event.smsId,
        occurredAt: event.occurredAt,
        payload: {
            kind: event.kind,
            cashFlow: event.cashFlow,
            amount: event.amount,
            currency: event.currency,
            accountLast4: event.accountLast4 ?? null,
            counterpartyLast4: event.counterpartyLast4 ?? null,
            accountName: event.accountName ?? null,
            bank: event.bank ?? null,
            merchant: event.merchant ?? null,
            transactionType: event.transactionType ?? null,
            classifier: event.classifier,
            classifierVersion: event.classifierVersion,
            fireflyTransactionId: event.fireflyTransactionId ?? null,
            fireflyPushedAt: event.fireflyPushedAt ?? null,
        },
    };
}

/**
 * Wraps a bill+NEUTRAL due reminder for GET /knowledge?kind=due.
 *
 * @param source - Analysis row joined with the SMS
 */
export function toDueKnowledgeItem(source: DueAnalysisSource): KnowledgeItem {
    const data = source.extractedData;
    const amounts = parseDueAmounts(source.body);
    const extractedAmount = asFiniteNumber(data.amount);
    const totalDue = amounts.totalDue ?? null;
    const minDue = amounts.minDue ?? null;

    return {
        type: "due",
        id: source.smsId,
        occurredAt: source.occurredAt,
        payload: {
            kind: "due",
            dueDate: asOptionalString(data.dueDate),
            minDue,
            totalDue,
            amount: totalDue ?? minDue ?? extractedAmount,
            currency:
                asOptionalString(data.currency) ??
                (totalDue || minDue || extractedAmount ? "INR" : null),
            accountLast4: asOptionalString(data.accountLast4),
            accountName: asOptionalString(data.accountName),
            bank: asOptionalString(data.bank),
            merchant: asOptionalString(data.merchant),
            classifier: source.classifier,
            classifierVersion: source.classifierVersion,
        },
    };
}

/**
 * Collapses repeated reminder SMS for the same last4, due date, and amount.
 * Non-due items are left unchanged and returned after the unique dues.
 *
 * @param items - Knowledge envelopes (typically all `type: "due"`)
 */
export function dedupeDueKnowledgeItems(items: KnowledgeItem[]): KnowledgeItem[] {
    const rest: KnowledgeItem[] = [];
    const dues: Array<DueReminderRow> = [];

    for (const item of items) {
        if (item.type !== "due") {
            rest.push(item);
            continue;
        }

        dues.push({
            smsId: item.id,
            occurredAt: item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt),
            dueDate: item.payload.dueDate,
            accountLast4: item.payload.accountLast4,
            amount: item.payload.amount,
            item,
        });
    }

    return [...keepLatestDueReminders(dues).map((row) => row.item), ...rest];
}

/**
 * Dedupes due SMS, then marks paid / overdue / open from card payment-ack SMS.
 *
 * @param dueSources - Due reminder analysis rows
 * @param paymentSources - Candidate received/credited analysis rows
 * @param today - `YYYY-MM-DD` (defaults to today IST)
 */
export function settleDueKnowledgeItems(
    dueSources: DueAnalysisSource[],
    paymentSources: DueAnalysisSource[],
    today: string = todayIstDate()
): KnowledgeItem[] {
    const dues: DueReminderRow[] = dueSources.flatMap((source) => {
        const cashFlow =
            typeof source.extractedData.cashFlow === "string"
                ? source.extractedData.cashFlow
                : undefined;

        if (!isDueKnowledgeRow("bill", cashFlow, source.body)) {
            return [];
        }

        const item = toDueKnowledgeItem(source);

        if (item.type === "due" && !hasPayableDueAmount(item.payload)) {
            return [];
        }
        return [
            {
                smsId: source.smsId,
                occurredAt: source.occurredAt,
                dueDate: item.type === "due" ? item.payload.dueDate : null,
                accountLast4: item.type === "due" ? item.payload.accountLast4 : null,
                amount: item.type === "due" ? item.payload.amount : null,
                item,
            },
        ];
    });
    const unique = keepLatestDueReminders(dues);
    const payments: CardPaymentAck[] = paymentSources.flatMap((source) => {
        const cashFlow =
            typeof source.extractedData.cashFlow === "string"
                ? source.extractedData.cashFlow
                : undefined;

        if (!isCardPaymentAckRow("bill", cashFlow, source.body)) {
            return [];
        }

        return [
            {
                smsId: source.smsId,
                occurredAt: source.occurredAt,
                accountLast4: asOptionalString(source.extractedData.accountLast4),
                amount: asFiniteNumber(source.extractedData.amount),
            },
        ];
    });
    const statuses = settleDueStatuses(unique, payments, today);

    return unique
        .map((row) => withDueStatus(row.item, statuses.get(row.smsId) ?? "open"))
        .sort(compareDueAttention);
}

/**
 * Stable due-cycle key used to collapse reminders and store paid marks.
 *
 * @param item - Knowledge envelope
 */
export function knowledgeDueReminderKey(item: KnowledgeItem): string | undefined {
    if (item.type !== "due") {
        return undefined;
    }

    return dueReminderKey({
        smsId: item.id,
        dueDate: item.payload.dueDate,
        accountLast4: item.payload.accountLast4,
        amount: item.payload.amount,
    });
}

/**
 * Forces `paid` when the user marked that bill cycle paid in Narada.
 *
 * @param items - Settled due envelopes
 * @param markedKeys - Keys from `due_marks`
 */
export function applyManualDueMarks(items: KnowledgeItem[], markedKeys: Set<string>): KnowledgeItem[] {
    if (markedKeys.size === 0) {
        return items.map((item) => withMarkedPaid(item, false));
    }

    return items.map((item) => {
        const key = knowledgeDueReminderKey(item);
        const marked = Boolean(key && markedKeys.has(key));

        if (marked && item.type === "due") {
            return withMarkedPaid(withDueStatus(item, "paid"), true);
        }

        return withMarkedPaid(item, false);
    });
}

function withMarkedPaid(item: KnowledgeItem, markedPaid: boolean): KnowledgeItem {
    if (item.type !== "due") {
        return item;
    }

    return {
        ...item,
        payload: {
            ...item.payload,
            markedPaid,
        },
    };
}

/**
 * Sets due attention status on a knowledge envelope.
 *
 * @param item - Knowledge item
 * @param status - open, overdue, or paid
 */
export function withDueStatus(item: KnowledgeItem, status: DueAttentionStatus): KnowledgeItem {
    if (item.type !== "due") {
        return item;
    }

    return {
        ...item,
        payload: {
            ...item.payload,
            status,
        },
    };
}

/**
 * Default due list hides paid bills. `all` keeps them.
 *
 * @param items - Settled due envelopes
 * @param status - `open` / `overdue` / `paid` / `all` / omitted (unpaid)
 */
export function filterDueKnowledgeItems(
    items: KnowledgeItem[],
    status: string | undefined
): KnowledgeItem[] {
    const actionable = items.filter(
        (item) => item.type !== "due" || hasPayableDueAmount(item.payload)
    );

    if (status === "all") {
        return actionable;
    }

    if (status === "open" || status === "overdue" || status === "paid") {
        return actionable.filter((item) => item.type === "due" && item.payload.status === status);
    }

    return actionable.filter((item) => item.type === "due" && item.payload.status !== "paid");
}

function compareDueAttention(left: KnowledgeItem, right: KnowledgeItem): number {
    const leftRank = dueStatusRank(left);
    const rightRank = dueStatusRank(right);

    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }

    const leftDay = left.type === "due" ? left.payload.dueDate ?? "9999-99-99" : "9999-99-99";
    const rightDay = right.type === "due" ? right.payload.dueDate ?? "9999-99-99" : "9999-99-99";
    const byDay = leftDay.localeCompare(rightDay);

    if (byDay !== 0) {
        return byDay;
    }

    return right.id - left.id;
}

function dueStatusRank(item: KnowledgeItem): number {
    if (item.type !== "due") {
        return 9;
    }

    if (item.payload.status === "overdue") {
        return 0;
    }

    if (item.payload.status === "open") {
        return 1;
    }

    return 2;
}

interface DueReminderRow {
    smsId: number;
    occurredAt: Date;
    dueDate: string | null;
    accountLast4: string | null;
    amount: number | null;
    item: KnowledgeItem;
}

/**
 * Wraps a blocked or skipped Firefly dry-run for GET /knowledge?kind=exception.
 *
 * @param exception - Unpushed event plus dry-run reason
 */
export function toExceptionKnowledgeItem(exception: PushException): KnowledgeItem {
    const event = exception.event;

    return {
        type: "exception",
        id: event.smsId,
        occurredAt: event.occurredAt,
        payload: {
            kind: event.kind,
            amount: event.amount,
            currency: event.currency,
            accountLast4: event.accountLast4 ?? null,
            counterpartyLast4: event.counterpartyLast4 ?? null,
            bank: event.bank ?? null,
            merchant: event.merchant ?? null,
            status: exception.status,
            reason: exception.reason,
        },
    };
}

function asOptionalString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    return null;
}

