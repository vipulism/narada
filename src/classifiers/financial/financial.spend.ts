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
        needles: ["APOLLO", "1MG", "PHARMEASY", "PHARMACY", "HOSPITAL", "MEDPLUS", "NETMEDS"],
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
 */
export function buildSpendMonthStats(
    thisRows: SpendEvent[],
    lastRows: SpendEvent[],
    thisLabel: string,
    lastLabel: string
): SpendMonthStats {
    const thisBuckets = sumBuckets(thisRows);
    const lastBuckets = sumBuckets(lastRows);
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

function sumBuckets(rows: SpendEvent[]): Map<SpendBucket, number> {
    const totals = new Map<SpendBucket, number>();

    for (const row of rows) {
        if (row.kind && row.kind !== "expense") {
            continue;
        }

        const bucket = spendBucket(row.merchant);
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

        const label = displayMerchant(row.merchant);
        totals.set(label, (totals.get(label) ?? 0) + row.amount);
    }

    return totals;
}

function displayMerchant(merchant?: string | null): string {
    const trimmed = merchant?.replace(/\s+/g, " ").trim();
    return trimmed && trimmed.length > 0 ? trimmed : "Unknown";
}

function normalizeSpendText(value: string): string {
    return value
        .toUpperCase()
        .replace(/RAZ\*/g, "")
        .replace(/WI-FI/g, "WIFI")
        .replace(/\s+/g, " ")
        .trim();
}
