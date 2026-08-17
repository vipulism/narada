import { FinancialEvent } from "../classifiers/financial/financial.model";

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

/** One knowledge item. `id` is `sms_messages.id` (stable across event rebuilds). */
export interface KnowledgeItem {
    type: "financial";
    id: number;
    occurredAt: Date;
    payload: KnowledgeFinancialPayload;
}

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
