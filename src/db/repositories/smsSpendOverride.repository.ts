import { getDb } from "../mariaConnection";
import { RowDataPacket } from "mysql2";
import { isSpendBucket, type SpendBucket } from "../../classifiers/financial/financial.spend";

/** Per-SMS spend category and/or merchant catalog move. */
export interface SmsSpendOverrideRow {
    category?: SpendBucket;
    merchantKey?: string;
    merchantLabel?: string;
}

/**
 * User overrides for one expense SMS (`sms_spend_overrides`).
 */
export class SmsSpendOverrideRepository {
    /**
     * SMS id → category and/or merchant catalog key.
     *
     * @returns Override map used by merchants, Telegram, and Firefly
     */
    async listAll(): Promise<Map<number, SmsSpendOverrideRow>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT sms_id, category, merchant_key, merchant_label
            FROM sms_spend_overrides
            `
        );
        const overrides = new Map<number, SmsSpendOverrideRow>();

        for (const row of rows) {
            const smsId = Number(row.sms_id);

            if (!Number.isFinite(smsId) || smsId <= 0) {
                continue;
            }

            const parsed = rowToOverride(row);

            if (parsed) {
                overrides.set(smsId, parsed);
            }
        }

        return overrides;
    }

    /**
     * Loads the override for one SMS, if any.
     *
     * @param smsId - `financial_events.sms_id`
     */
    async get(smsId: number): Promise<SmsSpendOverrideRow | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT sms_id, category, merchant_key, merchant_label
            FROM sms_spend_overrides
            WHERE sms_id = ?
            LIMIT 1
            `,
            [smsId]
        );

        return rows[0] ? rowToOverride(rows[0]) : null;
    }

    /**
     * How many SMS overrides use this spend bucket.
     *
     * @param category - Spend bucket slug
     */
    async countByCategory(category: string): Promise<number> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS n
            FROM sms_spend_overrides
            WHERE category = ?
            `,
            [category]
        );

        return Number(rows[0]?.n ?? 0);
    }

    /**
     * Upserts a per-SMS category and/or merchant move.
     *
     * @param smsId - Expense SMS id
     * @param override - Fields to persist (omit a field to store NULL)
     */
    async upsert(smsId: number, override: SmsSpendOverrideRow): Promise<void> {
        const db = getDb();

        await db.query(
            `
            INSERT INTO sms_spend_overrides (sms_id, category, merchant_key, merchant_label)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                category = VALUES(category),
                merchant_key = VALUES(merchant_key),
                merchant_label = VALUES(merchant_label),
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                smsId,
                override.category ?? null,
                override.merchantKey ?? null,
                override.merchantLabel ?? null,
            ]
        );
    }

    /**
     * Removes every override for one SMS.
     *
     * @param smsId - Expense SMS id
     */
    async delete(smsId: number): Promise<void> {
        const db = getDb();

        await db.query(
            `
            DELETE FROM sms_spend_overrides
            WHERE sms_id = ?
            `,
            [smsId]
        );
    }
}

function rowToOverride(row: RowDataPacket): SmsSpendOverrideRow | null {
    const categoryRaw = String(row.category ?? "").trim();
    const category = isSpendBucket(categoryRaw) ? categoryRaw : undefined;
    const merchantKey = String(row.merchant_key ?? "").trim() || undefined;
    const merchantLabel = String(row.merchant_label ?? "").trim() || undefined;

    if (!category && !merchantKey) {
        return null;
    }

    return { category, merchantKey, merchantLabel };
}
