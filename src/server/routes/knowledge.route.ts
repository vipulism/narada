import { Request, Response, Router } from "express";
import { CLASSIFIERS } from "../../classifiers/classifier.registry";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { SmsDueRepository } from "../../importers/sms/smsDue.repository";
import { toDueKnowledgeItem, toKnowledgeItem } from "../knowledge.mapper";
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
 * `kind=due` reads bill+NEUTRAL reminders from sms_analysis; other kinds use financial_events.
 */
export function createKnowledgeRouter(): Router {
    const router = Router();

    router.get("/knowledge", listKnowledge);
    router.get("/knowledge/:id", getKnowledge);

    return router;
}

async function listKnowledge(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const kind = dueKindAlias(optionalQueryString(req.query.kind) ?? optionalQueryString(req.query.type));
    const last4 = optionalQueryString(req.query.last4);
    const bank = optionalQueryString(req.query.bank);
    const pushed = optionalQueryBoolean(req.query.pushed);

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
            },
        });
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

function dueKindAlias(kind: string | undefined): string | undefined {
    return kind === "due" ? "due" : kind;
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
