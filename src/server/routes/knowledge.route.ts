import { Request, Response, Router } from "express";
import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
    toPushException,
    type PushExceptionStatus,
} from "../../connectors/firefly/firefly.exceptions";
import { planFireflyTransaction } from "../../connectors/firefly/firefly.dryRun";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { loadSettledDueKnowledge } from "../due.feed";
import {
    toExceptionKnowledgeItem,
    toKnowledgeItem,
    type KnowledgeItem,
} from "../knowledge.mapper";
import {
    matchesKnowledgeQuery,
    parseKnowledgeOrder,
    parseKnowledgeSort,
    sortKnowledgeItems,
} from "../knowledge.query";
import {
    optionalPositiveInt,
    optionalQueryBoolean,
    optionalQueryDate,
    optionalQueryString,
    paginationMeta,
    parsePagination,
} from "../pagination";

const events = new FinancialEventRepository();

/**
 * GET /knowledge, GET /knowledge/search, and GET /knowledge/:id.
 * `kind=due` reads unpaid unique bills (paid when a received/credited SMS matches last4). `kind=exception` dry-runs unpushed Dhan posts.
 */
export function createKnowledgeRouter(): Router {
    const router = Router();

    router.get("/knowledge/search", searchKnowledge);
    router.get("/knowledge", listKnowledge);
    router.get("/knowledge/:id", getKnowledge);

    return router;
}

async function listKnowledge(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const kind = knowledgeKind(
        optionalQueryString(req.query.kind) ?? optionalQueryString(req.query.type)
    );
    const last4 = optionalQueryString(req.query.last4);
    const bank = optionalQueryString(req.query.bank);
    const pushed = optionalQueryBoolean(req.query.pushed);
    const q = optionalQueryString(req.query.q);
    const sort = optionalQueryString(req.query.sort);
    const order = optionalQueryString(req.query.order);
    const from = optionalQueryDate(req.query.from);
    const to = optionalQueryDate(req.query.to);
    const status = parseExceptionStatus(optionalQueryString(req.query.status));

    if (kind === "due") {
        const dueStatus = optionalQueryString(req.query.status);
        const unique = sortKnowledgeList(
            await loadSettledDueKnowledge({
                last4,
                bank,
                from,
                to,
                status: dueStatus,
                q,
            }),
            sort,
            order
        );
        const start = (page - 1) * limit;

        res.status(200).json({
            items: unique.slice(start, start + limit),
            pagination: paginationMeta(page, limit, unique.length),
            filters: {
                kind: "due",
                last4: last4 ?? null,
                bank: bank ?? null,
                pushed: null,
                status: dueStatus ?? "unpaid",
                q: q ?? null,
                from: from?.toISOString() ?? null,
                to: to?.toISOString() ?? null,
                sort: parseKnowledgeSort(sort) ?? null,
                order: sort ? parseKnowledgeOrder(order) : null,
            },
        });
        return;
    }

    if (kind === "exception") {
        if (!isFireflyConfigured()) {
            res.status(503).json({ message: "FIREFLY_URL or FIREFLY_TOKEN missing" });
            return;
        }

        try {
            const items = sortKnowledgeList(
                (await loadExceptionKnowledge({ last4, bank, status, from, to })).filter((item) =>
                    matchesKnowledgeQuery(item, q)
                ),
                sort,
                order
            );
            const start = (page - 1) * limit;

            res.status(200).json({
                items: items.slice(start, start + limit),
                pagination: paginationMeta(page, limit, items.length),
                filters: {
                    kind: "exception",
                    last4: last4 ?? null,
                    bank: bank ?? null,
                    pushed: false,
                    status: status ?? null,
                    q: q ?? null,
                    from: from?.toISOString() ?? null,
                    to: to?.toISOString() ?? null,
                    sort: parseKnowledgeSort(sort) ?? null,
                    order: sort ? parseKnowledgeOrder(order) : null,
                },
            });
        } catch (error) {
            res.status(502).json({
                message: error instanceof Error ? error.message : "Firefly dry-run failed",
            });
        }
        return;
    }

    const result = await events.listPage({
        page,
        limit,
        kind,
        last4,
        bank,
        pushed,
    });

    res.status(200).json({
        items: result.items.map(toKnowledgeItem),
        pagination: paginationMeta(page, limit, result.total),
        filters: {
            kind: kind ?? null,
            last4: last4 ?? null,
            bank: bank ?? null,
            pushed: pushed ?? null,
            status: null,
        },
    });
}

async function getKnowledge(req: Request, res: Response): Promise<void> {
    const id = optionalPositiveInt(req.params.id);

    if (!id) {
        res.status(404).json({ message: "Knowledge not found" });
        return;
    }

    const event = await events.getBySmsId(id);

    if (event) {
        if (!event.fireflyTransactionId && isFireflyConfigured()) {
            try {
                const planner = await loadExceptionPlanner();
                const row = planFireflyTransaction(
                    event,
                    planner.firefly,
                    planner.owned,
                    planner.openings
                );
                const exception = toPushException(event, row);

                if (exception) {
                    res.status(200).json(toExceptionKnowledgeItem(exception));
                    return;
                }
            } catch {
                // Fall through to the posted financial envelope.
            }
        }

        res.status(200).json(toKnowledgeItem(event));
        return;
    }

    const settled = await loadSettledDueKnowledge({ status: "all" });
    const due = settled.find((item) => item.id === id);

    if (due) {
        res.status(200).json(due);
        return;
    }

    res.status(404).json({ message: "Knowledge not found" });
}

/**
 * GET /knowledge/search — dues and push exceptions by last4, bank, merchant, body, or reason.
 */
async function searchKnowledge(req: Request, res: Response): Promise<void> {
    const q = optionalQueryString(req.query.q);

    if (!q) {
        res.status(400).json({ message: "q is required" });
        return;
    }

    const { page, limit } = parsePagination(req.query);
    const last4 = optionalQueryString(req.query.last4);
    const bank = optionalQueryString(req.query.bank);
    const dueStatus = optionalQueryString(req.query.status) ?? "all";
    const sort = optionalQueryString(req.query.sort);
    const order = optionalQueryString(req.query.order);
    const from = optionalQueryDate(req.query.from);
    const to = optionalQueryDate(req.query.to);
    const dues = await loadSettledDueKnowledge({ last4, bank, from, to, status: dueStatus, q });
    let exceptions: KnowledgeItem[] = [];

    if (isFireflyConfigured()) {
        try {
            exceptions = (await loadExceptionKnowledge({ last4, bank, from, to })).filter((item) =>
                matchesKnowledgeQuery(item, q)
            );
        } catch {
            exceptions = [];
        }
    }

    const sorted = sortKnowledgeList(
        [...dues, ...exceptions],
        sort ?? "occurredAt",
        order ?? (sort ? "asc" : "desc")
    );
    const start = (page - 1) * limit;

    res.status(200).json({
        items: sorted.slice(start, start + limit),
        pagination: paginationMeta(page, limit, sorted.length),
        filters: {
            q,
            last4: last4 ?? null,
            bank: bank ?? null,
            status: dueStatus,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
            sort: parseKnowledgeSort(sort) ?? "occurredAt",
            order: parseKnowledgeOrder(order ?? (sort ? "asc" : "desc")),
        },
    });
}

/**
 * Dry-runs unpushed Firefly rows as exception knowledge items.
 *
 * @param options - Optional last4, bank, time window, and blocked/skipped filter
 */
async function loadExceptionKnowledge(options: {
    last4?: string;
    bank?: string;
    from?: Date;
    to?: Date;
    status?: PushExceptionStatus;
}): Promise<KnowledgeItem[]> {
    const planner = await loadExceptionPlanner();
    const unpushed = await events.listUnpushed({
        last4: options.last4,
        bank: options.bank,
        from: options.from,
        to: options.to,
    });
    let exceptions = collectPushExceptions(
        unpushed,
        planner.firefly,
        planner.owned,
        planner.openings
    );

    if (options.status) {
        exceptions = exceptions.filter((item) => item.status === options.status);
    }

    return exceptions.map(toExceptionKnowledgeItem);
}

/**
 * Applies optional sort without changing order when `sort` is omitted.
 *
 * @param items - Knowledge envelopes
 * @param sort - Sort field
 * @param order - asc or desc
 */
function sortKnowledgeList(
    items: KnowledgeItem[],
    sort: string | undefined,
    order: string | undefined
): KnowledgeItem[] {
    return sortKnowledgeItems(items, parseKnowledgeSort(sort), parseKnowledgeOrder(order));
}

function knowledgeKind(kind: string | undefined): string | undefined {
    if (kind === "due" || kind === "exception") {
        return kind;
    }

    return kind;
}

function parseExceptionStatus(value: string | undefined): PushExceptionStatus | undefined {
    if (value === "blocked" || value === "skipped") {
        return value;
    }

    return undefined;
}
