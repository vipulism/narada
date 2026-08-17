import { Request, Response, Router } from "express";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { toKnowledgeItem } from "../knowledge.mapper";
import {
    optionalPositiveInt,
    optionalQueryBoolean,
    optionalQueryString,
    paginationMeta,
    parsePagination,
} from "../pagination";

const events = new FinancialEventRepository();

/**
 * GET /knowledge and GET /knowledge/:id (posted financial_events, id = smsId).
 */
export function createKnowledgeRouter(): Router {
    const router = Router();

    router.get("/knowledge", listKnowledge);
    router.get("/knowledge/:id", getKnowledge);

    return router;
}

async function listKnowledge(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const kind = optionalQueryString(req.query.kind);
    const last4 = optionalQueryString(req.query.last4);
    const bank = optionalQueryString(req.query.bank);
    const pushed = optionalQueryBoolean(req.query.pushed);

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

    if (!event) {
        res.status(404).json({ message: "Knowledge not found" });
        return;
    }

    res.status(200).json(toKnowledgeItem(event));
}
