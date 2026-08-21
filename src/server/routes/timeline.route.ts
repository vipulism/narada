import { Request, Response, Router } from "express";
import { CLASSIFIERS } from "../../classifiers/classifier.registry";
import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
} from "../../connectors/firefly/firefly.exceptions";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { SmsDueRepository } from "../../importers/sms/smsDue.repository";
import { listEventsForTimeline } from "../../repositories/event.repository";
import {
    dedupeDueKnowledgeItems,
    toDueKnowledgeItem,
    toExceptionKnowledgeItem,
    toKnowledgeItem,
} from "../knowledge.mapper";
import {
    optionalQueryDate,
    paginationMeta,
    parsePagination,
} from "../pagination";
import {
    mergeTimelineItems,
    paginateTimeline,
    parseTimelineTypes,
    toTimelineEventItem,
    type TimelineItem,
    type TimelineType,
} from "../timeline.mapper";

const STREAM_CAP = 500;
const events = new FinancialEventRepository();
const dues = new SmsDueRepository();

/**
 * GET /timeline — mixed due + exception + infra events (optional financial).
 */
export function createTimelineRouter(): Router {
    const router = Router();

    router.get("/timeline", listTimeline);

    return router;
}

async function listTimeline(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const types = parseTimelineTypes(req.query.type);
    const from = optionalQueryDate(req.query.from);
    const to = optionalQueryDate(req.query.to);
    const streams: TimelineItem[] = [];

    if (types.includes("due")) {
        streams.push(...(await loadDueItems(from, to)));
    }

    if (types.includes("exception")) {
        streams.push(...(await loadExceptionItems(from, to)));
    }

    if (types.includes("event")) {
        const rows = await listEventsForTimeline({ from, to, limit: STREAM_CAP });
        streams.push(...rows.map(toTimelineEventItem));
    }

    if (types.includes("financial")) {
        const result = await events.listPage({
            page: 1,
            limit: STREAM_CAP,
            from,
            to,
        });
        streams.push(...result.items.map(toKnowledgeItem));
    }

    const merged = mergeTimelineItems(streams);
    const sliced = paginateTimeline(merged, page, limit);

    res.status(200).json({
        items: sliced.items,
        pagination: paginationMeta(page, limit, sliced.total),
        filters: {
            type: types,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
        },
    });
}

async function loadDueItems(from?: Date, to?: Date): Promise<TimelineItem[]> {
    const preferred = preferredClassifier();
    const result = await dues.list({
        page: 1,
        limit: STREAM_CAP,
        from,
        to,
        classifier: preferred.name,
        classifierVersion: preferred.version,
    });

    return dedupeDueKnowledgeItems(result.items.map(toDueKnowledgeItem));
}

async function loadExceptionItems(from?: Date, to?: Date): Promise<TimelineItem[]> {
    if (!isFireflyConfigured()) {
        return [];
    }

    try {
        const planner = await loadExceptionPlanner();
        const unpushed = await events.listUnpushed({ from, to });
        const exceptions = collectPushExceptions(
            unpushed,
            planner.firefly,
            planner.owned,
            planner.openings
        );

        return exceptions.slice(0, STREAM_CAP).map(toExceptionKnowledgeItem);
    } catch {
        return [];
    }
}

function preferredClassifier(): { name: string; version: string } {
    const classifier = CLASSIFIERS[0];

    if (!classifier) {
        throw new Error("No SMS classifiers registered");
    }

    return {
        name: classifier.name,
        version: classifier.version,
    };
}

/** Exported for merge unit tests. */
export type { TimelineItem, TimelineType };
