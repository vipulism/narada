/**
 * SMS merchant → spend bucket for Telegram month stats and Firefly category_name.
 * Dhan has no categories until Narada POSTs a name (Firefly creates it).
 */

/** Built-in household spend group (always in dropdowns). */
export type BuiltinSpendBucket =
    | "grocery"
    | "dining"
    | "shopping"
    | "fuel"
    | "transport"
    | "utilities"
    | "subscriptions"
    | "insurance"
    | "health"
    | "education"
    | "other";

/** Builtin slug or a user-created `^[a-z][a-z0-9_]{0,31}$` key. */
export type SpendBucket = string;

/** Allowed builtin buckets for the merchants page and Firefly `category_name`. */
export const SPEND_BUCKETS: readonly BuiltinSpendBucket[] = [
    "grocery",
    "dining",
    "shopping",
    "fuel",
    "transport",
    "utilities",
    "subscriptions",
    "insurance",
    "health",
    "education",
    "other",
];

/** Dropdown / API row for one spend bucket. */
export interface SpendBucketOption {
    key: SpendBucket;
    label: string;
    custom: boolean;
}

/** User-created bucket persisted in `spend_buckets`. */
export interface CustomSpendBucket {
    key: string;
    label: string;
}

/** One this-month vs last-month total. */
export interface SpendCompareLine {
    key: string;
    label: string;
    thisAmount: number;
    lastAmount: number;
}

/** Bucket + merchant totals for the daily Telegram digest. */
export interface SpendMonthStats {
    thisLabel: string;
    lastLabel: string;
    buckets: SpendCompareLine[];
    topMerchant?: SpendCompareLine;
    largeMerchants: SpendCompareLine[];
}

const BUCKET_LABEL: Record<BuiltinSpendBucket, string> = {
    grocery: "Groceries",
    dining: "Dining",
    shopping: "Shopping",
    fuel: "Fuel",
    transport: "Transport",
    utilities: "Utilities",
    subscriptions: "Subscriptions",
    insurance: "Insurance",
    health: "Health",
    education: "Education",
    other: "Other",
};

const BUCKET_KEYWORDS: Array<{ bucket: SpendBucket; needles: string[] }> = [
    {
        bucket: "grocery",
        needles: [
            "GROCER",
            "SUPERMARKET",
            "MILKBASKET",
            "BIGBASKET",
            "BLINKIT",
            "ZEPTO",
            "DMART",
            "D-MART",
            "NATURES BASKET",
            "KIRANA",
            "VEGETABLE",
            "SABZI",
            "SABJI",
            "GENERAL STORE",
            "PROVISION",
            "PANSARI",
            "DAIRY",
            "BAKERY",
            "SWEETS",
        ],
    },
    {
        bucket: "dining",
        needles: [
            "SWIGGY",
            "ZOMATO",
            "DOMINO",
            "PIZZA",
            "MCDONALD",
            "KFC",
            "STARBUCKS",
            "CAFE",
            "RESTAURANT",
            "EAT.",
            "BURGER",
        ],
    },
    {
        bucket: "shopping",
        needles: [
            "AMAZON",
            "FLIPKART",
            "MYNTRA",
            "AJIO",
            "NYKAA",
            "MEESHO",
            "MALL",
            "LIFESTYLE",
            "WESTSIDE",
            "CROMA",
            "RELIANCE DIGITAL",
            "TANISHQ",
            "TITAN COMPANY",
            "IKEA",
            "GARMENTS",
            "BOUTIQUE",
            "FOOTWEAR",
            "MOBILES",
        ],
    },
    {
        bucket: "fuel",
        needles: ["IOCL", "BPCL", "HPCL", "PETROL", "DIESEL", "FUEL", "INDIAN OIL", "BHARAT PETROLEUM"],
    },
    {
        bucket: "transport",
        needles: ["OLA", "UBER", "METRO", "IRCTC", "RAPIDO", "FASTAG", "TOLL", "UBER INDIA", "PARKING"],
    },
    {
        bucket: "utilities",
        needles: [
            "BSES",
            "AIRTEL",
            "JIO",
            "TATA PLAY",
            "BROADBAND",
            "ELECTRIC",
            "WATER BOARD",
            "INDIANESE",
            "IGL",
            "INDRAPRASTHA GA",
        ],
    },
    {
        bucket: "subscriptions",
        needles: [
            "NETFLIX",
            "SPOTIFY",
            "HOTSTAR",
            "YOUTUBE",
            "PRIME VIDEO",
            "SONYLIV",
            "APPLE.COM/BILL",
            "LINKEDIN",
        ],
    },
    {
        bucket: "insurance",
        needles: ["MAX LIFE", "LIC", "HDFC LIFE", "ICICI PRU", "STAR HEALTH", "INSURANCE"],
    },
    {
        bucket: "health",
        needles: ["APOLLO", "1MG", "PHARMEASY", "PHARMACY", "HOSPITAL", "MEDPLUS", "NETMEDS", "MEDICAL", "CHEMIST", "MEDICOS"],
    },
    {
        bucket: "education",
        needles: [
            "SCHOOL",
            "TUITION",
            "COLLEGE",
            "UNIVERSITY",
            "PLAYSCHOOL",
            "NURSERY",
            "KINDERGARTEN",
            "VIDYALAYA",
        ],
    },
];

const BUCKET_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

const BUCKET_CAP = 6;
const LARGE_MERCHANT_INR = 5000;
const LARGE_MERCHANT_CAP = 3;
const SAMPLE_SMS_CAP = 3;
const SMS_OWN_MERCHANT_PREFIX = "sms:";
/** Mall names also contain MALL (shopping); parking / FASTag / toll stay Transport. */
const TRANSPORT_BEFORE_SHOPPING = ["PARKING", "FASTAG", "TOLL"];

/** Per-SMS category and/or merchant catalog move. */
export interface SmsSpendOverride {
    category?: SpendBucket | null;
    merchantKey?: string | null;
    merchantLabel?: string | null;
}

/** User rename or merge of one catalog key onto another. */
export interface MerchantAlias {
    toKey: string;
    label: string;
}

/**
 * Firefly / digest label for a spend bucket.
 *
 * @param bucket - Spend group
 * @param extraLabels - Labels for user-created buckets
 */
export function spendBucketLabel(
    bucket: SpendBucket,
    extraLabels?: ReadonlyMap<string, string>
): string {
    return builtinBucketLabel(bucket) ?? extraLabels?.get(bucket) ?? humanizeBucketKey(bucket);
}

/**
 * True when `value` is a persistable spend-bucket slug.
 *
 * @param value - Request or DB string
 */
export function isSpendBucketKey(value: string): boolean {
    return BUCKET_KEY_RE.test(value);
}

/**
 * True when `value` is a built-in spend bucket.
 *
 * @param value - Request or DB string
 */
export function isBuiltinSpendBucket(value: string): value is BuiltinSpendBucket {
    return (SPEND_BUCKETS as readonly string[]).includes(value);
}

/**
 * True when `value` is a spend bucket. With `extraKeys`, only builtins plus those
 * keys (write path). Without it, any well-formed slug (read path / tests).
 *
 * @param value - Request or DB string
 * @param extraKeys - User-created bucket keys from `spend_buckets`
 */
export function isSpendBucket(value: string, extraKeys?: ReadonlySet<string>): value is SpendBucket {
    if (isBuiltinSpendBucket(value)) {
        return true;
    }

    if (extraKeys) {
        return extraKeys.has(value);
    }

    return isSpendBucketKey(value);
}

/**
 * Slug for a user-created bucket label (`Kids Activities` → `kids_activities`).
 *
 * @param label - Display name
 */
export function spendBucketKeyFromLabel(label: string): string | undefined {
    const slug = label
        .toLowerCase()
        .trim()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32)
        .replace(/_+$/g, "");

    return isSpendBucketKey(slug) ? slug : undefined;
}

/**
 * Validates a new custom bucket from the Merchants page / API.
 *
 * @param rawLabel - Display name
 * @param rawKey - Optional explicit slug
 */
export function parseNewSpendBucket(
    rawLabel: unknown,
    rawKey?: unknown
): CustomSpendBucket | { error: string } {
    if (typeof rawLabel !== "string") {
        return { error: "label is required" };
    }

    const label = rawLabel.replace(/\s+/g, " ").trim();

    if (label.length < 1 || label.length > 64) {
        return { error: "label must be 1–64 characters" };
    }

    const explicit = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
    const key = explicit || spendBucketKeyFromLabel(label);

    if (!key || !isSpendBucketKey(key)) {
        return { error: "bucket key must start with a letter, then letters, numbers, or underscores (max 32)" };
    }

    if (isBuiltinSpendBucket(key)) {
        return { error: "that name is a built-in bucket" };
    }

    return { key, label };
}

/**
 * Dropdown rows for GET /merchants (builtins, then user-created).
 *
 * @param extra - Custom buckets from `spend_buckets`
 * @returns Bucket key, Firefly / UI label, and whether it is user-created
 */
export function spendBucketOptions(extra: readonly CustomSpendBucket[] = []): SpendBucketOption[] {
    const seen = new Set<string>(SPEND_BUCKETS);
    const builtin = SPEND_BUCKETS.map((key) => ({
        key,
        label: spendBucketLabel(key),
        custom: false,
    }));
    const custom = extra
        .filter((row) => isSpendBucketKey(row.key) && !seen.has(row.key))
        .map((row) => {
            seen.add(row.key);
            return { key: row.key, label: row.label, custom: true };
        });

    return [...builtin, ...custom];
}

/**
 * Stable id for one merchant on the catalog (Paytm QR VPAs collapse).
 *
 * @param merchant - Extracted merchant or VPA
 */
export function merchantCatalogKey(merchant?: string | null): string {
    return spendMerchantLabel(merchant).toLowerCase();
}

/**
 * Catalog key that keeps one SMS on its own merchant row.
 *
 * @param smsId - Expense SMS id
 */
export function ownSmsMerchantKey(smsId: number): string {
    return `${SMS_OWN_MERCHANT_PREFIX}${smsId}`;
}

/**
 * True when `key` is a one-SMS merchant row (`sms:{id}`).
 *
 * @param key - Catalog id
 */
export function isOwnSmsMerchantKey(key: string): boolean {
    return key.startsWith(SMS_OWN_MERCHANT_PREFIX);
}

/**
 * Follows rename / merge aliases. Same `toKey` as `from` is a display rename.
 *
 * @param key - Pattern or overridden catalog id
 * @param aliases - `merchant_aliases` keyed by from-key
 */
export function resolveMerchantAlias(
    key: string,
    aliases?: ReadonlyMap<string, MerchantAlias>
): { key: string; label?: string } {
    if (!aliases?.size) {
        return { key };
    }

    const seen = new Set<string>();
    let current = key;
    let label: string | undefined;

    while (aliases.has(current) && !seen.has(current)) {
        seen.add(current);
        const alias = aliases.get(current);

        if (!alias) {
            break;
        }

        label = alias.label || label;

        if (alias.toKey === current) {
            break;
        }

        current = alias.toKey;
    }

    return { key: current, label };
}

/**
 * SMS override first, then user merchant map, then keyword heuristics.
 *
 * @param merchant - Extracted merchant
 * @param assigned - `merchant_categories` keyed by catalog id
 * @param body - Raw SMS body when merchant is thin
 * @param smsOverride - Per-SMS category or merchant move
 * @param aliases - Optional merchant rename / merge map
 */
export function resolveSpendBucket(
    merchant?: string | null,
    assigned?: ReadonlyMap<string, SpendBucket>,
    body?: string | null,
    smsOverride?: SmsSpendOverride | null,
    aliases?: ReadonlyMap<string, MerchantAlias>
): SpendBucket {
    if (smsOverride?.category) {
        return smsOverride.category;
    }

    const key = resolveMerchantAlias(
        smsOverride?.merchantKey || merchantCatalogKey(merchant),
        aliases
    ).key;
    return assigned?.get(key) ?? spendBucket(merchant, body);
}

/**
 * Maps a merchant (and SMS body fallback) to a spend bucket.
 *
 * @param merchant - Extracted merchant
 * @param body - Raw SMS body when merchant is thin
 */
export function spendBucket(merchant?: string | null, body?: string | null): SpendBucket {
    const text = normalizeSpendText([merchant, body].filter(Boolean).join(" "));

    if (!text) {
        return "other";
    }

    if (TRANSPORT_BEFORE_SHOPPING.some((needle) => text.includes(needle))) {
        return "transport";
    }

    for (const row of BUCKET_KEYWORDS) {
        if (row.needles.some((needle) => text.includes(needle))) {
            return row.bucket;
        }
    }

    return "other";
}

/**
 * Groups expense rows into buckets and merchants for this vs last month.
 *
 * @param thisRows - Posted expenses in this-month range
 * @param lastRows - Posted expenses in last-month same-days range
 * @param thisLabel - e.g. `Aug 1–22`
 * @param lastLabel - e.g. `Jul 1–22`
 * @param assigned - Optional Narada merchant → bucket map
 * @param smsOverrides - Optional per-SMS category / merchant moves
 * @param aliases - Optional merchant rename / merge map
 * @param bucketLabels - Labels for user-created buckets
 */
export function buildSpendMonthStats(
    thisRows: SpendEvent[],
    lastRows: SpendEvent[],
    thisLabel: string,
    lastLabel: string,
    assigned?: ReadonlyMap<string, SpendBucket>,
    smsOverrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>,
    bucketLabels?: ReadonlyMap<string, string>
): SpendMonthStats {
    const thisBuckets = sumBuckets(thisRows, assigned, smsOverrides, aliases);
    const lastBuckets = sumBuckets(lastRows, assigned, smsOverrides, aliases);
    const thisMerchants = sumMerchants(thisRows, aliases);
    const lastMerchants = sumMerchants(lastRows, aliases);

    const keys = new Set<string>([...thisBuckets.keys(), ...lastBuckets.keys()]);
    const buckets = [...keys]
        .map((bucket) => ({
            key: bucket,
            label: spendBucketLabel(bucket, bucketLabels),
            thisAmount: thisBuckets.get(bucket) ?? 0,
            lastAmount: lastBuckets.get(bucket) ?? 0,
        }))
        .filter((row) => row.thisAmount > 0 || row.lastAmount > 0)
        .sort((left, right) => right.thisAmount - left.thisAmount)
        .slice(0, BUCKET_CAP);

    const merchantLines = [...thisMerchants.entries()]
        .map(([key, thisAmount]) => ({
            key,
            label: key,
            thisAmount,
            lastAmount: lastMerchants.get(key) ?? 0,
        }))
        .sort((left, right) => right.thisAmount - left.thisAmount);

    const largeMerchants = merchantLines
        .filter((row) => row.thisAmount >= LARGE_MERCHANT_INR)
        .slice(0, LARGE_MERCHANT_CAP);

    return {
        thisLabel,
        lastLabel,
        buckets,
        topMerchant: merchantLines[0],
        largeMerchants,
    };
}

/** Posted expense fields used for spend grouping. */
export interface SpendEvent {
    smsId?: number;
    amount: number;
    merchant?: string | null;
    kind?: string | null;
}

/** One SMS merchant group for the Narada merchants page. */
export interface MerchantCatalogItem {
    key: string;
    label: string;
    category: SpendBucket | null;
    suggested: SpendBucket;
    txCount: number;
    pushedCount: number;
    totalAmount: number;
    lastSeenAt: Date | null;
    sampleSmsIds: number[];
}

/** How the Merchants list can be ordered. */
export type MerchantSortField = "lastSeen" | "amount" | "name" | "open";

/**
 * Parses `sort` for GET /merchants. Default is newest SMS in the group.
 *
 * @param value - Raw `sort` query
 */
export function parseMerchantSort(value: string | undefined): MerchantSortField {
    if (value === "amount" || value === "name" || value === "open") {
        return value;
    }

    return "lastSeen";
}

/**
 * True when `q` matches the merchant label, key, bucket, or a sample SMS id.
 *
 * @param item - Catalog row
 * @param query - User search string
 */
export function matchesMerchantQuery(item: MerchantCatalogItem, query?: string): boolean {
    const needle = query?.trim().toLowerCase();

    if (!needle) {
        return true;
    }

    if (
        item.label.toLowerCase().includes(needle) ||
        item.key.includes(needle) ||
        item.suggested.includes(needle) ||
        (item.category ?? "").includes(needle)
    ) {
        return true;
    }

    return item.sampleSmsIds.some((smsId) => String(smsId).includes(needle));
}

/**
 * Orders merchant groups. Newest SMS first unless `sort` says otherwise.
 *
 * @param items - Catalog rows
 * @param sort - List order
 */
export function sortMerchantCatalog(
    items: readonly MerchantCatalogItem[],
    sort: MerchantSortField = "lastSeen"
): MerchantCatalogItem[] {
    return [...items].sort((left, right) => compareMerchantCatalog(left, right, sort));
}

/** Persisted user assignment for a catalog key. */
export interface MerchantCategoryAssignment {
    category: SpendBucket;
    label: string;
}

/** Grouped `financial_events` spend for one raw merchant string. */
export interface MerchantSpendTotal {
    merchant: string;
    catalogKey?: string;
    txCount: number;
    pushedCount?: number;
    sampleSmsIds?: number[];
    totalAmount: number;
    lastSeenAt: Date;
}

/**
 * Collapses SMS merchants (UPI VPAs, casing) and overlays user categories.
 *
 * @param rows - Expense totals grouped by raw `financial_events.merchant`
 * @param assignments - Saved categories keyed by {@link merchantCatalogKey}
 * @param labels - Optional display names keyed by catalog id
 */
export function buildMerchantCatalog(
    rows: MerchantSpendTotal[],
    assignments: ReadonlyMap<string, MerchantCategoryAssignment>,
    labels?: ReadonlyMap<string, string>
): MerchantCatalogItem[] {
    const byKey = new Map<string, MerchantCatalogItem>();

    for (const row of rows) {
        const key = row.catalogKey ?? merchantCatalogKey(row.merchant);
        const label = labels?.get(key) || spendMerchantLabel(row.merchant);
        const existing = byKey.get(key);

        if (existing) {
            existing.txCount += row.txCount;
            existing.pushedCount += row.pushedCount ?? 0;
            existing.totalAmount += row.totalAmount;
            existing.sampleSmsIds = mergeSampleSmsIds(
                existing.sampleSmsIds,
                row.sampleSmsIds
            );

            if (!existing.lastSeenAt || row.lastSeenAt > existing.lastSeenAt) {
                existing.lastSeenAt = row.lastSeenAt;
                existing.label = label;
            }

            continue;
        }

        byKey.set(key, {
            key,
            label,
            category: null,
            suggested: spendBucket(row.merchant),
            txCount: row.txCount,
            pushedCount: row.pushedCount ?? 0,
            totalAmount: row.totalAmount,
            lastSeenAt: row.lastSeenAt,
            sampleSmsIds: (row.sampleSmsIds ?? []).slice(0, SAMPLE_SMS_CAP),
        });
    }

    for (const [key, assignment] of assignments) {
        const existing = byKey.get(key);

        if (existing) {
            existing.category = assignment.category;
            if (labels?.get(key)) {
                existing.label = labels.get(key) ?? existing.label;
            }
            continue;
        }

        byKey.set(key, {
            key,
            label: labels?.get(key) || assignment.label,
            category: assignment.category,
            suggested: spendBucket(assignment.label),
            txCount: 0,
            pushedCount: 0,
            totalAmount: 0,
            lastSeenAt: null,
            sampleSmsIds: [],
        });
    }

    return sortMerchantCatalog([...byKey.values()], "open");
}

function compareMerchantCatalog(
    left: MerchantCatalogItem,
    right: MerchantCatalogItem,
    sort: MerchantSortField
): number {
    if (sort === "name") {
        return left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
    }

    if (sort === "open") {
        const leftOpen = left.category ? 1 : 0;
        const rightOpen = right.category ? 1 : 0;

        if (leftOpen !== rightOpen) {
            return leftOpen - rightOpen;
        }
    }

    if (sort === "amount" || sort === "open") {
        if (right.totalAmount !== left.totalAmount) {
            return right.totalAmount - left.totalAmount;
        }

        return compareLastSeen(left, right) || left.label.localeCompare(right.label);
    }

    const seen = compareLastSeen(left, right);

    if (seen !== 0) {
        return seen;
    }

    if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
    }

    return left.label.localeCompare(right.label);
}

function compareLastSeen(left: MerchantCatalogItem, right: MerchantCatalogItem): number {
    return lastSeenMillis(right) - lastSeenMillis(left);
}

function lastSeenMillis(item: MerchantCatalogItem): number {
    return item.lastSeenAt?.getTime() ?? 0;
}

function sumBuckets(
    rows: SpendEvent[],
    assigned?: ReadonlyMap<string, SpendBucket>,
    smsOverrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>
): Map<SpendBucket, number> {
    const totals = new Map<SpendBucket, number>();

    for (const row of rows) {
        if (row.kind && row.kind !== "expense") {
            continue;
        }

        const override = row.smsId != null ? smsOverrides?.get(row.smsId) : undefined;
        const bucket = resolveSpendBucket(row.merchant, assigned, undefined, override, aliases);
        totals.set(bucket, (totals.get(bucket) ?? 0) + row.amount);
    }

    return totals;
}

function sumMerchants(
    rows: SpendEvent[],
    aliases?: ReadonlyMap<string, MerchantAlias>
): Map<string, number> {
    const totals = new Map<string, number>();

    for (const row of rows) {
        if (row.kind && row.kind !== "expense") {
            continue;
        }

        const resolved = resolveMerchantAlias(merchantCatalogKey(row.merchant), aliases);
        const label = resolved.label || spendMerchantLabel(row.merchant);
        totals.set(label, (totals.get(label) ?? 0) + row.amount);
    }

    return totals;
}

/**
 * Display name when one SMS is split onto its own merchant row.
 *
 * @param merchant - Extracted merchant or VPA
 * @param smsId - Expense SMS id
 */
export function ownSmsMerchantLabel(merchant: string | undefined, smsId: number): string {
    const trimmed = merchant?.replace(/\s+/g, " ").trim();

    if (!trimmed) {
        return `SMS #${smsId}`;
    }

    const base = spendMerchantLabel(trimmed)
        .replace(/\b[A-Za-z]\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const vpa = trimmed.match(/^([^@\s]+)@/);

    if (vpa && vpa[1].length > 8) {
        return `${base || spendMerchantLabel(trimmed)} ${vpa[1].slice(-6)}`;
    }

    return base === "Unknown" ? `SMS #${smsId}` : `${base} #${smsId}`;
}

/**
 * Digest label for a merchant or UPI VPA (`shop@okaxis`, Paytm QR).
 *
 * @param merchant - Extracted merchant
 */
export function spendMerchantLabel(merchant?: string | null): string {
    const trimmed = merchant?.replace(/\s+/g, " ").trim();

    if (!trimmed) {
        return "Unknown";
    }

    if (/titan\s*company/i.test(trimmed) || /\btanishq\b/i.test(trimmed)) {
        return "Tanishq";
    }

    if (/\bindraprastha\s+ga/i.test(trimmed) || /^igl$/i.test(trimmed)) {
        return "IGL";
    }

    const vpa = trimmed.match(/^([^@\s]+)@([A-Za-z0-9.]+)$/);

    if (!vpa) {
        return trimmed;
    }

    const local = vpa[1];

    if (/^paytmqr/i.test(local)) {
        return "Paytm QR";
    }

    const words = local
        .replace(/[._-]+/g, " ")
        .replace(/\d+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (words.length >= 3 && /[A-Za-z]{3}/.test(words)) {
        return words.replace(/\b([a-z])/gi, (char) => char.toUpperCase());
    }

    return trimmed;
}

function mergeSampleSmsIds(left?: number[], right?: number[]): number[] {
    const seen = new Set<number>();
    const merged: number[] = [];

    for (const id of [...(left ?? []), ...(right ?? [])]) {
        if (!Number.isFinite(id) || seen.has(id)) {
            continue;
        }

        seen.add(id);
        merged.push(id);

        if (merged.length >= SAMPLE_SMS_CAP) {
            break;
        }
    }

    return merged;
}

function builtinBucketLabel(bucket: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(BUCKET_LABEL, bucket)
        ? BUCKET_LABEL[bucket as BuiltinSpendBucket]
        : undefined;
}

function humanizeBucketKey(key: string): string {
    return key
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function normalizeSpendText(value: string): string {
    return value
        .toUpperCase()
        .replace(/RAZ\*/g, "")
        .replace(/WI-FI/g, "WIFI")
        .replace(/\s+/g, " ")
        .trim();
}
