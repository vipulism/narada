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
} from "../knowledge.mapper";
import {
    optionalPositiveInt,
    optionalQueryBoolean,
    optionalQueryString,
    paginationMeta,
    parsePagination,
} from "../pagination";

const events = new FinancialEventRepository();

/**
 * GET /knowledge and GET /knowledge/:id.
 * `kind=due` reads unpaid unique bills (paid when a received/credited SMS matches last4). `kind=exception` dry-runs unpushed Dhan posts.
 */
export function createKnowledgeRouter(): Router {
    const router = Router();

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
    const status = parseExceptionStatus(optionalQueryString(req.query.status));

    if (kind === "due") {
        const dueStatus = optionalQueryString(req.query.status);
        const unique = await loadSettledDueKnowledge({
            last4,
            bank,
            status: dueStatus,
        });
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
            const planner = await loadExceptionPlanner();
            const unpushed = await events.listUnpushed({ last4, bank });
            let exceptions = collectPushExceptions(
                unpushed,
                planner.firefly,
                planner.owned,
                planner.openings
            );

            if (status) {
                exceptions = exceptions.filter((item) => item.status === status);
            }

            const total = exceptions.length;
            const start = (page - 1) * limit;
            const items = exceptions.slice(start, start + limit).map(toExceptionKnowledgeItem);

            res.status(200).json({
                items,
                pagination: paginationMeta(page, limit, total),
                filters: {
                    kind: "exception",
                    last4: last4 ?? null,
                    bank: bank ?? null,
                    pushed: false,
                    status: status ?? null,
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
