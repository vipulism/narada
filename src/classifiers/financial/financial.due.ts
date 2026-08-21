import { isDueReminder } from "./financial.kind";

/**
 * Min and total due parsed from a statement / reminder SMS.
 */
export interface DueAmounts {
    minDue?: number;
    totalDue?: number;
}

/**
 * True when an analysis row is a due reminder that never posts to the ledger.
 *
 * @param subcategory - sms_analysis.subcategory
 * @param cashFlow - extracted cashFlow
 * @param body - SMS body
 */
export function isDueKnowledgeRow(
    subcategory: string | null | undefined,
    cashFlow: string | undefined,
    body: string
): boolean {
    return subcategory === "bill" && cashFlow === "NEUTRAL" && isDueReminder(body.toUpperCase());
}

/**
 * Reads min due and total due labels. First unlabeled `amount` in the SMS is often min due.
 *
 * @param body - Raw SMS body
 */
export function parseDueAmounts(body: string): DueAmounts {
    return {
        minDue: firstAmount(body, MIN_DUE_REGEX),
        totalDue: firstAmount(body, TOTAL_DUE_REGEX),
    };
}

const MIN_DUE_REGEX =
    /min(?:imum)?(?:\s+(?:amt|amount))?\s+due(?:\s+is)?[^\d]{0,16}(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;

const TOTAL_DUE_REGEX =
    /total(?:\s+(?:amt|amount))?\s+due(?:\s+is)?[^\d]{0,16}(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i;

function firstAmount(body: string, pattern: RegExp): number | undefined {
    const match = body.match(pattern);

    if (!match?.[1]) {
        return undefined;
    }

    const parsed = Number(match[1].replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : undefined;
}
