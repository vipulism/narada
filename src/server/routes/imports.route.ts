import { Request, Response, Router } from "express";
import { SmsImportRepository } from "../../importers/sms/smsImport.repository";
import { SmsImportStatus } from "../../importers/sms/smsImport.model";
import {
    optionalPositiveInt,
    optionalQueryString,
    paginationMeta,
    parsePagination,
} from "../pagination";

const imports = new SmsImportRepository();

/**
 * GET /imports and GET /imports/:id.
 */
export function createImportsRouter(): Router {
    const router = Router();

    router.get("/imports", listImports);
    router.get("/imports/:id", getImport);

    return router;
}

async function listImports(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const status = parseImportStatus(optionalQueryString(req.query.status));
    const result = await imports.list({ page, limit, status });

    res.status(200).json({
        items: result.items,
        pagination: paginationMeta(page, limit, result.total),
        filters: {
            status: status ?? null,
        },
    });
}

async function getImport(req: Request, res: Response): Promise<void> {
    const id = optionalPositiveInt(req.params.id);

    if (!id) {
        res.status(404).json({ message: "Import not found" });
        return;
    }

    const record = await imports.getById(id);

    if (!record) {
        res.status(404).json({ message: "Import not found" });
        return;
    }

    res.status(200).json(record);
}

function parseImportStatus(value: string | undefined): SmsImportStatus | undefined {
    if (value === "completed" || value === "failed") {
        return value;
    }

    return undefined;
}
