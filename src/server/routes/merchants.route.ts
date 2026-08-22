import { Request, Response, Router } from "express";
import {
    buildMerchantCatalog,
    isOwnSmsMerchantKey,
    isSpendBucket,
    merchantCatalogKey,
    ownSmsMerchantKey,
    ownSmsMerchantLabel,
    resolveSpendBucket,
    spendBucketLabel,
    spendBucketOptions,
    spendMerchantLabel,
    type MerchantCatalogItem,
    type SpendBucket,
} from "../../classifiers/financial/financial.spend";
import { isFireflyConfigured } from "../../connectors/firefly/firefly.exceptions";
import { loadFireflyClient } from "../../connectors/firefly/firefly.client";
import {
    applyAssignedCategoriesToDhan,
    applyMerchantCategoryToDhan,
    applySmsCategoryToDhan,
    type DhanRecategorizeStats,
} from "../../connectors/firefly/firefly.recategorize";
import { FinancialParser } from "../../classifiers/financial/financial.parser";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";
import { MerchantCategoryRepository } from "../../db/repositories/merchantCategory.repository";
import { SmsSpendOverrideRepository } from "../../db/repositories/smsSpendOverride.repository";
import {
    effectiveCatalogKey,
    expenseCatalogKey,
    expenseMerchant,
    groupExpenseTotals,
    listSmsForMerchantKey,
} from "../merchant.catalog";
import { optionalPositiveInt, optionalQueryString, paginationMeta, parsePagination } from "../pagination";

interface SmsMerchantContext {
    smsId: number;
    patternKey: string;
    patternLabel: string;
    merchantKey: string;
    merchantLabel: string;
    category: SpendBucket | null;
    suggested: SpendBucket;
    pushed: boolean;
    ownMerchantKey: string;
    override: { category: SpendBucket | null; merchantKey: string | null } | null;
    buckets: Array<{ key: SpendBucket; label: string }>;
    merchants: Array<{ key: string; label: string }>;
}

const events = new FinancialEventRepository();
const categories = new MerchantCategoryRepository();
const smsOverrides = new SmsSpendOverrideRepository();

/**
 * GET /merchants, GET /merchants/sms, PUT /merchants, PUT /merchants/sms/:smsId,
 * and POST /merchants/apply.
 */
export function createMerchantsRouter(): Router {
    const router = Router();

    router.get("/merchants/sms/:smsId", getMerchantSms);
    router.put("/merchants/sms/:smsId", assignMerchantSms);
    router.get("/merchants/sms", listMerchantSms);
    router.get("/merchants", listMerchants);
    router.post("/merchants/apply", applyMerchantCategories);
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
    const catalog = await loadCatalog();
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

/**
 * GET /merchants/sms — every expense SMS for one catalog key (verify the group).
 */
async function listMerchantSms(req: Request, res: Response): Promise<void> {
    const rawKey = optionalQueryString(req.query.key) ?? optionalQueryString(req.query.merchant);

    if (!rawKey) {
        res.status(400).json({ message: "key is required" });
        return;
    }

    const key = isOwnSmsMerchantKey(rawKey) ? rawKey : merchantCatalogKey(rawKey);
    const { page } = parsePagination(req.query);
    const limit = merchantLimit(req.query.limit);
    const [rows, overrides] = await Promise.all([
        events.listExpenseCatalogRows(),
        smsOverrides.listAll(),
    ]);
    const matched = listSmsForMerchantKey(rows, [], key, overrides);
    const start = (page - 1) * limit;

    res.status(200).json({
        items: matched.slice(start, start + limit).map((row) => ({
            smsId: row.smsId,
            merchant: spendMerchantLabel(row.merchant),
            amount: row.amount,
            occurredAt: row.occurredAt.toISOString(),
        })),
        pagination: paginationMeta(page, limit, matched.length),
        filters: { key },
    });
}

/**
 * GET /merchants/sms/:smsId — category and merchant-item dropdowns for one SMS.
 */
async function getMerchantSms(req: Request, res: Response): Promise<void> {
    const smsId = optionalPositiveInt(req.params.smsId);

    if (!smsId) {
        res.status(404).json({ message: "SMS not found" });
        return;
    }

    const context = await loadSmsMerchantContext(smsId);

    if (!context) {
        res.status(404).json({ message: "expense SMS not found" });
        return;
    }

    res.status(200).json(context);
}

/**
 * PUT /merchants/sms/:smsId — set this SMS category and/or move it to another item.
 */
async function assignMerchantSms(req: Request, res: Response): Promise<void> {
    const smsId = optionalPositiveInt(req.params.smsId);

    if (!smsId) {
        res.status(404).json({ message: "SMS not found" });
        return;
    }

    const [rows, existing] = await Promise.all([
        events.listExpenseCatalogRows(),
        smsOverrides.get(smsId),
    ]);
    const row = rows.find((item) => item.smsId === smsId);

    if (!row) {
        res.status(404).json({ message: "expense SMS not found" });
        return;
    }

    let category = existing?.category;
    let merchantKey = existing?.merchantKey;
    let merchantLabel = existing?.merchantLabel;

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "category")) {
        const rawCategory = req.body.category;

        if (rawCategory === null || rawCategory === "") {
            category = undefined;
        } else if (typeof rawCategory === "string" && isSpendBucket(rawCategory)) {
            category = rawCategory;
        } else {
            res.status(400).json({ message: "category must be a spend bucket" });
            return;
        }
    }

    if (
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "merchantKey") ||
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "merchant")
    ) {
        const rawMerchant =
            bodyString(req.body?.merchantKey) ?? bodyString(req.body?.merchant) ?? "";

        if (!rawMerchant) {
            merchantKey = undefined;
            merchantLabel = undefined;
        } else if (rawMerchant === "__own__" || rawMerchant === ownSmsMerchantKey(smsId)) {
            const parser = new FinancialParser();
            const patternMerchant = expenseMerchant(row.merchant, row.body, parser);
            merchantKey = ownSmsMerchantKey(smsId);
            merchantLabel = ownSmsMerchantLabel(patternMerchant, smsId);
        } else {
            const nextKey = merchantCatalogKey(rawMerchant);

            if (isOwnSmsMerchantKey(nextKey) && nextKey !== ownSmsMerchantKey(smsId)) {
                res.status(400).json({ message: "merchantKey does not match this SMS" });
                return;
            }

            if (nextKey.length > 255) {
                res.status(400).json({ message: "merchantKey is too long" });
                return;
            }

            const catalog = await loadCatalog();
            merchantKey = nextKey;
            merchantLabel =
                catalog.find((item) => item.key === nextKey)?.label ||
                spendMerchantLabel(bodyString(req.body?.merchantLabel) ?? rawMerchant);
        }
    }

    if (!category && !merchantKey) {
        await smsOverrides.delete(smsId);
    } else {
        await smsOverrides.upsert(smsId, { category, merchantKey, merchantLabel });
    }

    const context = await loadSmsMerchantContext(smsId);

    if (!context) {
        res.status(404).json({ message: "expense SMS not found" });
        return;
    }

    const dhan = bodyBoolean(req.body?.applyToDhan)
        ? await recategorizeSmsDhan(smsId, context.category ?? context.suggested)
        : undefined;
    res.status(200).json({ sms: context, dhan: dhan ?? null });
}

async function assignMerchant(req: Request, res: Response): Promise<void> {
    const rawKey = bodyString(req.body?.key) ?? bodyString(req.body?.merchant);

    if (!rawKey) {
        res.status(400).json({ message: "key is required" });
        return;
    }

    const key = isOwnSmsMerchantKey(rawKey) ? rawKey : merchantCatalogKey(rawKey);

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
    const dhan = bodyBoolean(req.body?.applyToDhan)
        ? await recategorizeDhan(key, category)
        : undefined;
    res.status(200).json({ item: toMerchantJson(item), dhan: dhan ?? null });
}

/**
 * POST /merchants/apply — rewrite `category_name` on already-pushed Dhan withdrawals
 * (one SMS, one merchant, or every assigned merchant).
 */
async function applyMerchantCategories(req: Request, res: Response): Promise<void> {
    const rawKey = bodyString(req.body?.key) ?? bodyString(req.body?.merchant);
    const smsId = optionalPositiveInt(req.body?.smsId);

    if (smsId) {
        const context = await loadSmsMerchantContext(smsId);

        if (!context) {
            res.status(404).json({ message: "expense SMS not found" });
            return;
        }

        const dhan = await recategorizeSmsDhan(smsId, context.category ?? context.suggested);
        res.status(200).json({ sms: context, dhan });
        return;
    }

    if (req.body?.all === true) {
        const [assignments, overrides] = await Promise.all([
            categories.listAssignments(),
            smsOverrides.listAll(),
        ]);
        const work = [...assignments.entries()].map(([key, row]) => ({
            key,
            categoryName: spendBucketLabel(row.category),
        }));

        if (work.length === 0 && overrides.size === 0) {
            res.status(400).json({ message: "no merchants have a category yet" });
            return;
        }

        const dhan = await recategorizeAssigned(work, overrides);
        res.status(200).json({ dhan });
        return;
    }

    if (!rawKey) {
        res.status(400).json({ message: "key is required" });
        return;
    }

    const key = isOwnSmsMerchantKey(rawKey) ? rawKey : merchantCatalogKey(rawKey);
    const assignments = await categories.listAssignments();
    const assigned = assignments.get(key);

    if (!assigned) {
        res.status(400).json({ message: "assign a category before applying to Dhan" });
        return;
    }

    const dhan = await recategorizeDhan(key, assigned.category);
    res.status(200).json({ dhan });
}

async function loadCatalog(): Promise<MerchantCatalogItem[]> {
    const [rows, assignments, overrides] = await Promise.all([
        events.listExpenseCatalogRows(),
        categories.listAssignments(),
        smsOverrides.listAll(),
    ]);

    return buildMerchantCatalog(groupExpenseTotals(rows, overrides), assignments);
}

async function loadCatalogItem(key: string, fallbackLabel: string): Promise<MerchantCatalogItem> {
    const assignments = await categories.listAssignments();
    const match = (await loadCatalog()).find((row) => row.key === key);

    if (match) {
        return match;
    }

    return {
        key,
        label: fallbackLabel,
        category: assignments.get(key)?.category ?? null,
        suggested: assignments.get(key)?.category ?? "other",
        txCount: 0,
        pushedCount: 0,
        totalAmount: 0,
        lastSeenAt: null,
        sampleSmsIds: [],
    };
}

async function loadSmsMerchantContext(smsId: number): Promise<SmsMerchantContext | null> {
    const [rows, assignments, overrides] = await Promise.all([
        events.listExpenseCatalogRows(),
        categories.listAssignments(),
        smsOverrides.listAll(),
    ]);
    const row = rows.find((item) => item.smsId === smsId);

    if (!row) {
        return null;
    }

    const parser = new FinancialParser();
    const override = overrides.get(smsId);
    const patternMerchant = expenseMerchant(row.merchant, row.body, parser);
    const patternKey = expenseCatalogKey(row.merchant, row.body, parser);
    const merchantKey = effectiveCatalogKey(row.merchant, row.body, parser, override);
    const catalog = buildMerchantCatalog(groupExpenseTotals(rows, overrides), assignments);
    const item = catalog.find((entry) => entry.key === merchantKey);
    const category = override?.category ?? assignments.get(merchantKey)?.category ?? null;

    return {
        smsId,
        patternKey,
        patternLabel: spendMerchantLabel(patternMerchant),
        merchantKey,
        merchantLabel: item?.label ?? override?.merchantLabel ?? spendMerchantLabel(patternMerchant),
        category,
        suggested: resolveSpendBucket(patternMerchant, undefined, row.body),
        pushed: row.pushed,
        ownMerchantKey: ownSmsMerchantKey(smsId),
        override: override
            ? {
                  category: override.category ?? null,
                  merchantKey: override.merchantKey ?? null,
              }
            : null,
        buckets: spendBucketOptions(),
        merchants: catalog
            .filter((entry) => entry.key !== patternKey && entry.key !== ownSmsMerchantKey(smsId))
            .map((entry) => ({ key: entry.key, label: entry.label }))
            .sort((left, right) => left.label.localeCompare(right.label)),
    };
}

function toMerchantJson(item: MerchantCatalogItem): Record<string, unknown> {
    return {
        key: item.key,
        label: item.label,
        category: item.category,
        suggested: item.suggested,
        txCount: item.txCount,
        pushedCount: item.pushedCount,
        totalAmount: item.totalAmount,
        lastSeenAt: item.lastSeenAt?.toISOString() ?? null,
        sampleSmsIds: item.sampleSmsIds,
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

async function recategorizeDhan(
    key: string,
    category: SpendBucket
): Promise<DhanRecategorizeStats | { skipped: true; reason: string }> {
    if (!isFireflyConfigured()) {
        return { skipped: true, reason: "FIREFLY_URL or FIREFLY_TOKEN missing" };
    }

    const [pushed, overrides] = await Promise.all([
        events.listPushedExpenses(),
        smsOverrides.listAll(),
    ]);
    return applyMerchantCategoryToDhan(
        loadFireflyClient(),
        pushed,
        key,
        spendBucketLabel(category),
        undefined,
        overrides
    );
}

async function recategorizeAssigned(
    work: Array<{ key: string; categoryName: string }>,
    overrides: Map<number, { category?: SpendBucket; merchantKey?: string }>
): Promise<DhanRecategorizeStats | { skipped: true; reason: string }> {
    if (!isFireflyConfigured()) {
        return { skipped: true, reason: "FIREFLY_URL or FIREFLY_TOKEN missing" };
    }

    const pushed = await events.listPushedExpenses();
    return applyAssignedCategoriesToDhan(loadFireflyClient(), pushed, work, undefined, overrides);
}

async function recategorizeSmsDhan(
    smsId: number,
    category: SpendBucket
): Promise<DhanRecategorizeStats | { skipped: true; reason: string }> {
    if (!isFireflyConfigured()) {
        return { skipped: true, reason: "FIREFLY_URL or FIREFLY_TOKEN missing" };
    }

    const event = await events.getBySmsId(smsId);

    if (!event?.fireflyTransactionId) {
        return { skipped: true, reason: "this SMS is not in Dhan yet" };
    }

    return applySmsCategoryToDhan(loadFireflyClient(), event.fireflyTransactionId, category);
}

function bodyBoolean(value: unknown): boolean {
    return value === true || value === "true" || value === 1 || value === "1";
}

function bodyString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
