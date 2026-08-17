import { Request, Response, Router } from "express";
import { CLASSIFIERS } from "../../classifiers/classifier.registry";
import { SmsRepository } from "../../importers/sms/sms.repository";
import {
    optionalPositiveInt,
    optionalQueryDate,
    optionalQueryString,
    paginationMeta,
    parsePagination,
} from "../pagination";

const smsRepository = new SmsRepository();

/**
 * GET /sms and GET /sms/:id.
 */
export function createSmsRouter(): Router {
    const router = Router();

    router.get("/sms", listSms);
    router.get("/sms/:id", getSms);

    return router;
}

async function listSms(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const preferred = preferredClassifier();
    const category = optionalQueryString(req.query.category);
    const subcategory = optionalQueryString(req.query.subcategory);
    const address = optionalQueryString(req.query.address);
    const from = optionalQueryDate(req.query.from);
    const to = optionalQueryDate(req.query.to);

    const result = await smsRepository.list({
        page,
        limit,
        category,
        subcategory,
        address,
        from,
        to,
        preferredClassifier: preferred.name,
        preferredVersion: preferred.version,
    });

    res.status(200).json({
        items: result.items,
        pagination: paginationMeta(page, limit, result.total),
        filters: {
            category: category ?? null,
            subcategory: subcategory ?? null,
            address: address ?? null,
            from: from?.toISOString() ?? null,
            to: to?.toISOString() ?? null,
        },
    });
}

async function getSms(req: Request, res: Response): Promise<void> {
    const id = optionalPositiveInt(req.params.id);

    if (!id) {
        res.status(404).json({ message: "SMS not found" });
        return;
    }

    const preferred = preferredClassifier();
    const sms = await smsRepository.findById(id, preferred.name, preferred.version);

    if (!sms) {
        res.status(404).json({ message: "SMS not found" });
        return;
    }

    res.status(200).json(sms);
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
