import { parseDueAmounts } from "../classifiers/financial/financial.due";
import { FinancialEvent } from "../classifiers/financial/financial.model";
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

