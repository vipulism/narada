import type { KnowledgeItem } from "./knowledge.mapper";
import type { TimelineEventRow } from "../repositories/event.repository";

/** Service / docker event on the mixed timeline. */
export interface TimelineEventPayload {
    eventType: string;
    severity: string;
    message: string;
    source: string;
    status: string;
    serviceId: string | null;
    serviceName: string | null;
    critical: boolean | null;
}

/** One timeline row. `id` is smsId (number) or narada_events.id (string). */
export type TimelineItem =
    | KnowledgeItem
    | {
          type: "event";
          id: string;
          occurredAt: Date;
          payload: TimelineEventPayload;
      };

/** Allowed `type` query values for GET /timeline. */
export type TimelineType = "due" | "exception" | "event" | "financial";

const TIMELINE_TYPES: TimelineType[] = ["due", "exception", "event", "financial"];
const DEFAULT_TYPES: TimelineType[] = ["due", "exception", "event"];

/**
 * Parses `type=due,event` or repeated `type` params. Empty → due + exception + event.
 *
 * @param value - Express query `type`
 */
export function parseTimelineTypes(value: unknown): TimelineType[] {
    const parts: string[] = [];

    if (Array.isArray(value)) {
        for (const item of value) {
            parts.push(...String(item).split(","));
        }
    } else if (typeof value === "string") {
        parts.push(...value.split(","));
    }

    const selected = new Set<TimelineType>();

    for (const part of parts) {
        const normalized = part.trim().toLowerCase();

        if ((TIMELINE_TYPES as string[]).includes(normalized)) {
            selected.add(normalized as TimelineType);
        }
    }

    return selected.size > 0 ? [...selected] : [...DEFAULT_TYPES];
}

/**
 * Wraps a homelab event for GET /timeline.
 *
 * @param row - narada_events row
 */
export function toTimelineEventItem(row: TimelineEventRow): TimelineItem {
    return {
        type: "event",
        id: row.id,
        occurredAt: row.occurredAt,
        payload: {
            eventType: row.eventType,
            severity: row.severity,
            message: row.message,
            source: row.source,
            status: row.status,
            serviceId: row.serviceId,
            serviceName: row.serviceName,
            critical: row.critical,
        },
    };
}

/**
 * Newest-first mix. Ties break on string id descending.
 *
 * @param items - Due, exception, event, and optional financial rows
 */
export function mergeTimelineItems(items: TimelineItem[]): TimelineItem[] {
    return [...items].sort((left, right) => {
        const delta = right.occurredAt.getTime() - left.occurredAt.getTime();

        if (delta !== 0) {
            return delta;
        }

        return String(right.id).localeCompare(String(left.id));
    });
}

/**
 * Slices a merged timeline to one page.
 *
 * @param items - Already merged newest-first
 * @param page - 1-based page
 * @param limit - Page size
 */
export function paginateTimeline(
    items: TimelineItem[],
    page: number,
    limit: number
): { items: TimelineItem[]; total: number } {
    const start = (page - 1) * limit;

    return {
        items: items.slice(start, start + limit),
        total: items.length,
    };
}
