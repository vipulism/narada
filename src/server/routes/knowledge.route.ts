import { Request, Response, Router } from "express";
import { CLASSIFIERS } from "../../classifiers/classifier.registry";
import {
    collectPushExceptions,
    isFireflyConfigured,
    loadExceptionPlanner,
    toPushException,
    type PushExceptionStatus,
} from "../../connectors/firefly/firefly.exceptions";
import { planFireflyTransaction } from "../../connectors/firefly/firefly.dryRun";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { SmsDueRepository } from "../../importers/sms/smsDue.repository";
import {
    toDueKnowledgeItem,
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
const dues = new SmsDueRepository();

/**
 * GET /knowledge and GET /knowledge/:id.
 * `kind=due` reads bill+NEUTRAL reminders; `kind=exception` dry-runs unpushed Dhan posts.
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
        const preferred = preferredClassifier();
        const result = await dues.list({
            page,
            limit,
            last4,
            bank,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        });

        res.status(200).json({
            items: result.items.map(toDueKnowledgeItem),
            pagination: paginationMeta(page, limit, result.total),
            filters: {
                kind: "due",
                last4: last4 ?? null,
                bank: bank ?? null,
                pushed: null,
                status: null,
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

    const preferred = preferredClassifier();
    const due = await dues.getBySmsId(id, preferred.name, preferred.version);

    if (due) {
        res.status(200).json(toDueKnowledgeItem(due));
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
