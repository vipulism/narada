import { CashFlow, FinancialEvent } from "./financial.model";
import { FinancialKind, isZerodhaFundingMessage } from "./financial.kind";

/**
 * Posted kinds that become ledger events. Due reminders and CC payment acks
 * stay in sms_analysis as bill NEUTRAL and are not persisted here.
 */
const POSTED_KIND_FLOW: Record<string, CashFlow> = {
    expense: CashFlow.OUTFLOW,
    income: CashFlow.INFLOW,
    transfer: CashFlow.NEUTRAL,
    bill: CashFlow.OUTFLOW,
    investment: CashFlow.OUTFLOW,
    epf: CashFlow.OUTFLOW,
};

export interface AnalysisEventSource {
    smsId: number;
    occurredAt: Date;
    body: string;
    category: string;
    subcategory: string | null;
    classifier: string;
    classifierVersion: string;
    extractedData: Record<string, unknown>;
}

/**
 * Returns true when an analysis row is a posted money movement with an amount.
 *
 * @param kind - sms_analysis.subcategory
 * @param cashFlow - extracted cashFlow
 * @param amount - extracted amount
 */
export function isPostedFinancialEvent(
    kind: string | null | undefined,
    cashFlow: string | undefined,
    amount: unknown
): boolean {
    if (!kind || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        return false;
    }

    return POSTED_KIND_FLOW[kind] === cashFlow;
}

/**
 * Maps a classified SMS analysis row to a financial event, or undefined if it
 * is not a posted transaction.
 *
 * @param source - Analysis row joined with the SMS received time
 */
export function toFinancialEvent(source: AnalysisEventSource): FinancialEvent | undefined {
    if (source.category !== "FINANCIAL") {
        return undefined;
    }

    const data = source.extractedData ?? {};
    const amount = asFiniteNumber(data.amount);
    const cashFlow = typeof data.cashFlow === "string" ? data.cashFlow : undefined;
    const kind = postedKind(source.subcategory, source.body);

    if (
        amount === undefined ||
        !kind ||
        !cashFlow ||
        !isPostedFinancialEvent(kind, cashFlow, amount)
    ) {
        return undefined;
    }

    return {
        smsId: source.smsId,
        kind,
        cashFlow,
        amount,
        currency: typeof data.currency === "string" && data.currency ? data.currency : "INR",
        accountLast4: asOptionalString(data.accountLast4),
        accountName: asOptionalString(data.accountName),
        bank: asOptionalString(data.bank),
        merchant: asOptionalString(data.merchant),
        transactionType: asOptionalString(data.transactionType),
        occurredAt: source.occurredAt,
        classifier: source.classifier,
        classifierVersion: source.classifierVersion,
    };
}

function postedKind(subcategory: string | null, body: string): FinancialKind | null {
    if (isZerodhaFundingMessage(body)) {
        return "investment";
    }

    return subcategory as FinancialKind | null;
}

function asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function asOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
