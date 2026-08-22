/**
 * SMS merchant → spend bucket for Telegram month stats and Firefly category_name.
 * Dhan has no categories until Narada POSTs a name (Firefly creates it).
 */

/** Household spend group used on the daily digest. */
export type SpendBucket =
    | "grocery"
    | "dining"
    | "shopping"
    | "fuel"
    | "transport"
    | "utilities"
    | "subscriptions"
    | "insurance"
    | "health"
    | "other";

/** Allowed buckets for the merchants page and Firefly `category_name`. */
export const SPEND_BUCKETS: readonly SpendBucket[] = [
    "grocery",
    "dining",
    "shopping",
    "fuel",
    "transport",
    "utilities",
    "subscriptions",
    "insurance",
    "health",
    "other",
];

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

const BUCKET_LABEL: Record<SpendBucket, string> = {
    grocery: "Groceries",
    dining: "Dining",
    shopping: "Shopping",
    fuel: "Fuel",
    transport: "Transport",
    utilities: "Utilities",
    subscriptions: "Subscriptions",
    insurance: "Insurance",
    health: "Health",
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
        needles: ["OLA", "UBER", "METRO", "IRCTC", "RAPIDO", "FASTAG", "TOLL", "UBER INDIA"],
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
        ],
    },
    {
        bucket: "subscriptions",
        needles: ["NETFLIX", "SPOTIFY", "HOTSTAR", "YOUTUBE", "PRIME VIDEO", "SONYLIV", "APPLE.COM/BILL"],
    },
    {
        bucket: "insurance",
        needles: ["MAX LIFE", "LIC", "HDFC LIFE", "ICICI PRU", "STAR HEALTH", "INSURANCE"],
    },
    {
        bucket: "health",
        needles: ["APOLLO", "1MG", "PHARMEASY", "PHARMACY", "HOSPITAL", "MEDPLUS", "NETMEDS", "MEDICAL", "CHEMIST", "MEDICOS"],
    },
];

const BUCKET_CAP = 6;
const LARGE_MERCHANT_INR = 5000;
const LARGE_MERCHANT_CAP = 3;
const SAMPLE_SMS_CAP = 3;
const SMS_OWN_MERCHANT_PREFIX = "sms:";

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
 */
export function spendBucketLabel(bucket: SpendBucket): string {
    return BUCKET_LABEL[bucket];
}

/**
 * True when `value` is a persisted spend bucket key.
 *
 * @param value - Request or DB string
 */
export function isSpendBucket(value: string): value is SpendBucket {
    return (SPEND_BUCKETS as readonly string[]).includes(value);
}

/**
 * Dropdown rows for GET /merchants.
 *
 * @returns Bucket key and Firefly / UI label
 */
export function spendBucketOptions(): Array<{ key: SpendBucket; label: string }> {
    return SPEND_BUCKETS.map((key) => ({ key, label: spendBucketLabel(key) }));
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
 */
export function buildSpendMonthStats(
    thisRows: SpendEvent[],
    lastRows: SpendEvent[],
    thisLabel: string,
    lastLabel: string,
    assigned?: ReadonlyMap<string, SpendBucket>,
    smsOverrides?: ReadonlyMap<number, SmsSpendOverride>,
    aliases?: ReadonlyMap<string, MerchantAlias>
): SpendMonthStats {
    const thisBuckets = sumBuckets(thisRows, assigned, smsOverrides, aliases);
    const lastBuckets = sumBuckets(lastRows, assigned, smsOverrides, aliases);
    const thisMerchants = sumMerchants(thisRows, aliases);
    const lastMerchants = sumMerchants(lastRows, aliases);

    const buckets = (Object.keys(BUCKET_LABEL) as SpendBucket[])
        .map((bucket) => ({
            key: bucket,
            label: spendBucketLabel(bucket),
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

    return [...byKey.values()].sort((left, right) => {
        const leftOpen = left.category ? 1 : 0;
        const rightOpen = right.category ? 1 : 0;

        if (leftOpen !== rightOpen) {
            return leftOpen - rightOpen;
        }

        if (right.totalAmount !== left.totalAmount) {
            return right.totalAmount - left.totalAmount;
        }

        return left.label.localeCompare(right.label);
    });
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

function normalizeSpendText(value: string): string {
    return value
        .toUpperCase()
        .replace(/RAZ\*/g, "")
        .replace(/WI-FI/g, "WIFI")
        .replace(/\s+/g, " ")
        .trim();
}
