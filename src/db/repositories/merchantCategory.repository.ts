import { getDb } from "../mariaConnection";
import { RowDataPacket } from "mysql2";
import {
    isSpendBucket,
    type MerchantCategoryAssignment,
    type SpendBucket,
} from "../../classifiers/financial/financial.spend";

/**
 * User-assigned spend buckets for SMS merchants (`merchant_categories`).
 */
export class MerchantCategoryRepository {
    /**
     * Catalog key → category + display label.
     *
     * @returns Assignment map used by GET /merchants
     */
    async listAssignments(): Promise<Map<string, MerchantCategoryAssignment>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT merchant_key, merchant_label, category
            FROM merchant_categories
            `
        );
        const assigned = new Map<string, MerchantCategoryAssignment>();

        for (const row of rows) {
            const key = String(row.merchant_key ?? "").trim();
            const category = String(row.category ?? "").trim();

            if (!key || !isSpendBucket(category)) {
                continue;
            }

            assigned.set(key, {
                category,
                label: String(row.merchant_label ?? key).trim() || key,
            });
        }

        return assigned;
    }

    /**
     * Catalog key → spend bucket (Firefly / Telegram).
     *
     * @returns Bucket map passed into `planFireflyTransaction`
     */
    async listBucketMap(): Promise<Map<string, SpendBucket>> {
        const assigned = await this.listAssignments();
        const buckets = new Map<string, SpendBucket>();

        for (const [key, row] of assigned) {
            buckets.set(key, row.category);
        }

        return buckets;
    }

    /**
     * Upserts a category for one merchant catalog key.
     *
     * @param merchantKey - {@link merchantCatalogKey}
     * @param merchantLabel - Display name
     * @param category - Spend bucket
     */
    async upsert(merchantKey: string, merchantLabel: string, category: SpendBucket): Promise<void> {
        const db = getDb();

        await db.query(
            `
            INSERT INTO merchant_categories (merchant_key, merchant_label, category)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                merchant_label = VALUES(merchant_label),
                category = VALUES(category),
                updated_at = CURRENT_TIMESTAMP
            `,
            [merchantKey, merchantLabel, category]
        );
    }

    /**
     * Clears a user assignment so keyword suggestion applies again.
     *
     * @param merchantKey - {@link merchantCatalogKey}
     */
    async delete(merchantKey: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            DELETE FROM merchant_categories
            WHERE merchant_key = ?
            `,
            [merchantKey]
        );
    }
}
