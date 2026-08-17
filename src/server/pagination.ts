/** Parsed page/limit from an HTTP query string. */
export interface PaginationQuery {
    page: number;
    limit: number;
}

/** List envelope metadata matching GET /events. */
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

/**
 * Reads `page` and `limit` from a query object. Default 1 / 10, max limit 100.
 *
 * @param query - Express `req.query`
 */
export function parsePagination(query: {
    page?: unknown;
    limit?: unknown;
}): PaginationQuery {
    const rawPage = Number(query.page ?? 1);
    const rawLimit = Number(query.limit ?? 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 100)
            : 10;

    return { page, limit };
}

/**
 * Builds the pagination object returned in list responses.
 *
 * @param page - Current page
 * @param limit - Page size
 * @param total - Matching row count
 */
export function paginationMeta(
    page: number,
    limit: number,
    total: number
): PaginationMeta {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Non-empty trimmed string from a query value.
 *
 * @param value - Express query value
 */
export function optionalQueryString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parses an ISO date query value. Invalid strings are ignored.
 *
 * @param value - Express query value
 */
export function optionalQueryDate(value: unknown): Date | undefined {
    const text = optionalQueryString(value);
    if (!text) {
        return undefined;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parses `true`/`false` (or `1`/`0`) from a query value.
 *
 * @param value - Express query value
 */
export function optionalQueryBoolean(value: unknown): boolean | undefined {
    const text = optionalQueryString(value)?.toLowerCase();

    if (text === "true" || text === "1") {
        return true;
    }

    if (text === "false" || text === "0") {
        return false;
    }

    return undefined;
}

/**
 * Parses a positive integer path/query id. Returns undefined when invalid.
 *
 * @param value - Route param or query value
 */
export function optionalPositiveInt(value: unknown): number | undefined {
    const text = typeof value === "string" ? value : String(value ?? "");
    const parsed = Number(text);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return undefined;
    }

    return parsed;
}
