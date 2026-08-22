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
 * User map first, then keyword heuristics.
 *
 * @param merchant - Extracted merchant
 * @param assigned - `merchant_categories` keyed by catalog id
 * @param body - Raw SMS body when merchant is thin
 */
export function resolveSpendBucket(
    merchant?: string | null,
    assigned?: ReadonlyMap<string, SpendBucket>,
    body?: string | null
): SpendBucket {
    return assigned?.get(merchantCatalogKey(merchant)) ?? spendBucket(merchant, body);
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
 */
export function buildSpendMonthStats(
    thisRows: SpendEvent[],
    lastRows: SpendEvent[],
    thisLabel: string,
    lastLabel: string,
    assigned?: ReadonlyMap<string, SpendBucket>
): SpendMonthStats {
    const thisBuckets = sumBuckets(thisRows, assigned);
    const lastBuckets = sumBuckets(lastRows, assigned);
    const thisMerchants = sumMerchants(thisRows);
    const lastMerchants = sumMerchants(lastRows);

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
    totalAmount: number;
    lastSeenAt: Date | null;
}

/** Persisted user assignment for a catalog key. */
export interface MerchantCategoryAssignment {
    category: SpendBucket;
    label: string;
}

/** Grouped `financial_events` spend for one raw merchant string. */
export interface MerchantSpendTotal {
    merchant: string;
    txCount: number;
    totalAmount: number;
    lastSeenAt: Date;
}

/**
 * Collapses SMS merchants (UPI VPAs, casing) and overlays user categories.
 *
 * @param rows - Expense totals grouped by raw `financial_events.merchant`
 * @param assignments - Saved categories keyed by {@link merchantCatalogKey}
 */
export function buildMerchantCatalog(
    rows: MerchantSpendTotal[],
    assignments: ReadonlyMap<string, MerchantCategoryAssignment>
): MerchantCatalogItem[] {
    const byKey = new Map<string, MerchantCatalogItem>();

    for (const row of rows) {
        const label = spendMerchantLabel(row.merchant);
        const key = merchantCatalogKey(row.merchant);
        const existing = byKey.get(key);

        if (existing) {
            existing.txCount += row.txCount;
            existing.totalAmount += row.totalAmount;

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
            totalAmount: row.totalAmount,
            lastSeenAt: row.lastSeenAt,
        });
    }

    for (const [key, assignment] of assignments) {
        const existing = byKey.get(key);

        if (existing) {
            existing.category = assignment.category;
            continue;
        }

        byKey.set(key, {
            key,
            label: assignment.label,
            category: assignment.category,
            suggested: spendBucket(assignment.label),
            txCount: 0,
            totalAmount: 0,
            lastSeenAt: null,
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
    assigned?: ReadonlyMap<string, SpendBucket>
): Map<SpendBucket, number> {
    const totals = new Map<SpendBucket, number>();

    for (const row of rows) {
        if (row.kind && row.kind !== "expense") {
            continue;
        }

        const bucket = resolveSpendBucket(row.merchant, assigned);
        totals.set(bucket, (totals.get(bucket) ?? 0) + row.amount);
    }

    return totals;
}

function sumMerchants(rows: SpendEvent[]): Map<string, number> {
    const totals = new Map<string, number>();

    for (const row of rows) {
        if (row.kind && row.kind !== "expense") {
            continue;
        }

        const label = spendMerchantLabel(row.merchant);
        totals.set(label, (totals.get(label) ?? 0) + row.amount);
    }

    return totals;
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

function normalizeSpendText(value: string): string {
    return value
        .toUpperCase()
        .replace(/RAZ\*/g, "")
        .replace(/WI-FI/g, "WIFI")
        .replace(/\s+/g, " ")
        .trim();
}
