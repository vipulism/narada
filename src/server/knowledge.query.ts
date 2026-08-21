import type { KnowledgeItem } from "./knowledge.mapper";

/** Fields the attention lists can sort by. */
export type KnowledgeSortField = "dueDate" | "amount" | "bank" | "occurredAt" | "status";

/** Sort direction. */
export type KnowledgeSortOrder = "asc" | "desc";

/**
 * Parses `sort` from a query string.
 *
 * @param value - Raw `sort` query
 */
export function parseKnowledgeSort(value: string | undefined): KnowledgeSortField | undefined {
    if (
        value === "dueDate" ||
        value === "amount" ||
        value === "bank" ||
        value === "occurredAt" ||
        value === "status"
    ) {
        return value;
    }

    return undefined;
}

/**
 * Parses `order` from a query string. Defaults to ascending.
 *
 * @param value - Raw `order` query
 */
export function parseKnowledgeOrder(value: string | undefined): KnowledgeSortOrder {
    return value === "desc" ? "desc" : "asc";
}

/**
 * True when `q` matches last4, bank, merchant, amounts, status, reason, id, or extra text (SMS body).
 *
 * @param item - Knowledge envelope
 * @param query - User search string
 * @param extra - Optional SMS body or other haystack text
 */
export function matchesKnowledgeQuery(
    item: KnowledgeItem,
    query: string | undefined,
    extra?: string
): boolean {
    const needle = query?.trim().toLowerCase();

    if (!needle) {
        return true;
    }

    return knowledgeHaystack(item, extra).includes(needle);
}

/**
 * Sorts knowledge items. Unknown/missing values sink to the end.
 *
 * @param items - Envelopes to sort
 * @param sort - Field, or undefined to keep incoming order
 * @param order - asc or desc
 */
export function sortKnowledgeItems(
    items: KnowledgeItem[],
    sort: KnowledgeSortField | undefined,
    order: KnowledgeSortOrder = "asc"
): KnowledgeItem[] {
    if (!sort) {
        return items;
    }

    const direction = order === "desc" ? -1 : 1;
    return [...items].sort((left, right) => {
        const compared = compareSortValues(sortValue(left, sort), sortValue(right, sort));
        if (compared !== 0) {
            return compared * direction;
        }

        return right.id - left.id;
    });
}

function knowledgeHaystack(item: KnowledgeItem, extra?: string): string {
    const payload = item.payload;
    const parts = [
        String(item.id),
        item.type,
        extra,
        "accountLast4" in payload ? payload.accountLast4 : undefined,
        "counterpartyLast4" in payload ? payload.counterpartyLast4 : undefined,
        "bank" in payload ? payload.bank : undefined,
        "merchant" in payload ? payload.merchant : undefined,
        "accountName" in payload ? payload.accountName : undefined,
        "dueDate" in payload ? payload.dueDate : undefined,
        "status" in payload ? payload.status : undefined,
        "reason" in payload ? payload.reason : undefined,
        "kind" in payload ? payload.kind : undefined,
        "amount" in payload ? String(payload.amount ?? "") : undefined,
        "minDue" in payload ? String(payload.minDue ?? "") : undefined,
        "totalDue" in payload ? String(payload.totalDue ?? "") : undefined,
    ];

    return parts
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ")
        .toLowerCase();
}

function sortValue(item: KnowledgeItem, sort: KnowledgeSortField): string | number | null {
    if (sort === "occurredAt") {
        const ms =
            item.occurredAt instanceof Date
                ? item.occurredAt.getTime()
                : new Date(item.occurredAt).getTime();
        return Number.isFinite(ms) ? ms : null;
    }

    if (item.type === "due") {
        if (sort === "dueDate") {
            return item.payload.dueDate ?? null;
        }
        if (sort === "amount") {
            return item.payload.amount ?? item.payload.totalDue ?? item.payload.minDue;
        }
        if (sort === "bank") {
            return item.payload.bank ?? null;
        }
        if (sort === "status") {
            return item.payload.status ?? null;
        }
    }

    if (item.type === "exception") {
        if (sort === "amount") {
            return item.payload.amount;
        }
        if (sort === "bank") {
            return item.payload.bank ?? null;
        }
        if (sort === "status") {
            return item.payload.status;
        }
    }

    if (item.type === "financial") {
        if (sort === "amount") {
            return item.payload.amount;
        }
        if (sort === "bank") {
            return item.payload.bank ?? null;
        }
    }

    return null;
}

function compareSortValues(left: string | number | null, right: string | number | null): number {
    if (left == null && right == null) {
        return 0;
    }
    if (left == null) {
        return 1;
    }
    if (right == null) {
        return -1;
    }
    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }

    return String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" });
}
