import { Request, Response, Router } from "express";
import {
    buildMerchantCatalog,
    isSpendBucket,
    merchantCatalogKey,
    spendBucketOptions,
    spendMerchantLabel,
    type MerchantCatalogItem,
    type SpendBucket,
} from "../../classifiers/financial/financial.spend";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { MerchantCategoryRepository } from "../../db/repositories/merchantCategory.repository";
import { optionalQueryString, paginationMeta, parsePagination } from "../pagination";

const events = new FinancialEventRepository();
const categories = new MerchantCategoryRepository();

/**
 * GET /merchants and PUT /merchants — SMS merchant catalog and spend assignments.
 */
export function createMerchantsRouter(): Router {
    const router = Router();

    router.get("/merchants", listMerchants);
    router.put("/merchants", assignMerchant);

    return router;
}

async function listMerchants(req: Request, res: Response): Promise<void> {
    const accept = req.headers.accept ?? "";

    if (accept.includes("text/html") && !accept.includes("application/json")) {
        res.redirect(302, "/merchants.html");
        return;
    }
    const { page } = parsePagination(req.query);
    const limit = merchantLimit(req.query.limit);
    const q = optionalQueryString(req.query.q)?.toLowerCase();
    const status = parseMerchantStatus(optionalQueryString(req.query.status));
    const [totals, assignments] = await Promise.all([
        events.listExpenseMerchantTotals(),
        categories.listAssignments(),
    ]);
    const catalog = buildMerchantCatalog(totals, assignments);
    const filtered = catalog.filter((item) => {
        if (status === "uncategorized" && item.category) {
            return false;
        }

        if (status === "categorized" && !item.category) {
            return false;
        }

        if (!q) {
            return true;
        }

        return item.label.toLowerCase().includes(q) || item.key.includes(q);
    });
    const start = (page - 1) * limit;

    res.status(200).json({
        items: filtered.slice(start, start + limit).map(toMerchantJson),
        pagination: paginationMeta(page, limit, filtered.length),
        buckets: spendBucketOptions(),
        filters: {
            q: q ?? null,
            status,
        },
        counts: {
            all: catalog.length,
            uncategorized: catalog.filter((row) => !row.category).length,
            categorized: catalog.filter((row) => Boolean(row.category)).length,
        },
    });
}

async function assignMerchant(req: Request, res: Response): Promise<void> {
    const rawKey = bodyString(req.body?.key) ?? bodyString(req.body?.merchant);

    if (!rawKey) {
        res.status(400).json({ message: "key is required" });
        return;
    }

    const key = merchantCatalogKey(rawKey);

    if (key.length > 255) {
        res.status(400).json({ message: "key is too long" });
        return;
    }

    const label =
        spendMerchantLabel(bodyString(req.body?.label) ?? rawKey) ||
        spendMerchantLabel(rawKey);
    const rawCategory = req.body?.category;

    if (rawCategory === null || rawCategory === "") {
        await categories.delete(key);
        const item = await loadCatalogItem(key, label);
        res.status(200).json({ item: toMerchantJson(item) });
        return;
    }

    if (typeof rawCategory !== "string" || !isSpendBucket(rawCategory)) {
        res.status(400).json({ message: "category must be a spend bucket" });
        return;
    }

    const category: SpendBucket = rawCategory;
    await categories.upsert(key, label, category);
    const item = await loadCatalogItem(key, label);
    res.status(200).json({ item: toMerchantJson(item) });
}

async function loadCatalogItem(key: string, fallbackLabel: string): Promise<MerchantCatalogItem> {
    const [totals, assignments] = await Promise.all([
        events.listExpenseMerchantTotals(),
        categories.listAssignments(),
    ]);
    const match = buildMerchantCatalog(totals, assignments).find((row) => row.key === key);

    if (match) {
        return match;
    }

    return {
        key,
        label: fallbackLabel,
        category: assignments.get(key)?.category ?? null,
        suggested: assignments.get(key)?.category ?? "other",
        txCount: 0,
        totalAmount: 0,
        lastSeenAt: null,
    };
}

function toMerchantJson(item: MerchantCatalogItem): Record<string, unknown> {
    return {
        key: item.key,
        label: item.label,
        category: item.category,
        suggested: item.suggested,
        txCount: item.txCount,
        totalAmount: item.totalAmount,
        lastSeenAt: item.lastSeenAt?.toISOString() ?? null,
    };
}

function parseMerchantStatus(value: string | undefined): "uncategorized" | "categorized" | "all" {
    if (value === "categorized" || value === "all") {
        return value;
    }

    return "uncategorized";
}

function merchantLimit(value: unknown): number {
    const raw = Number(value ?? 100);

    if (!Number.isFinite(raw) || raw <= 0) {
        return 100;
    }

    return Math.min(Math.floor(raw), 500);
}

function bodyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

