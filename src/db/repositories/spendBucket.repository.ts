import { getDb } from "../mariaConnection";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import {
    isSpendBucketKey,
    type CustomSpendBucket,
} from "../../classifiers/financial/financial.spend";

/**
 * User-created spend buckets (`spend_buckets`). Builtins stay in code.
 */
export class SpendBucketRepository {
    /**
     * Custom buckets for dropdowns and Firefly / Telegram labels.
     *
     * @returns Rows keyed for `spendBucketOptions`
     */
    async listAll(): Promise<CustomSpendBucket[]> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT bucket_key, label
            FROM spend_buckets
            ORDER BY label ASC
            `
        );
        const buckets: CustomSpendBucket[] = [];

        for (const row of rows) {
            const key = String(row.bucket_key ?? "").trim();
            const label = String(row.label ?? "").trim();

            if (!isSpendBucketKey(key) || !label) {
                continue;
            }

            buckets.push({ key, label });
        }

        return buckets;
    }

    /**
     * Custom bucket key → display / Firefly label.
     *
     * @returns Label map passed into `spendBucketLabel`
     */
    async labelMap(): Promise<Map<string, string>> {
        const labels = new Map<string, string>();

        for (const row of await this.listAll()) {
            labels.set(row.key, row.label);
        }

        return labels;
    }

    /**
     * Loads one custom bucket, if it exists.
     *
     * @param key - Bucket slug
     */
    async get(key: string): Promise<CustomSpendBucket | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT bucket_key, label
            FROM spend_buckets
            WHERE bucket_key = ?
            LIMIT 1
            `,
            [key]
        );
        const row = rows[0];

        if (!row) {
            return null;
        }

        const bucketKey = String(row.bucket_key ?? "").trim();
        const label = String(row.label ?? "").trim();

        if (!isSpendBucketKey(bucketKey) || !label) {
            return null;
        }

        return { key: bucketKey, label };
    }

    /**
     * Inserts a user-created bucket.
     *
     * @param key - Slug
     * @param label - Display / Firefly name
     */
    async insert(key: string, label: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            INSERT INTO spend_buckets (bucket_key, label)
            VALUES (?, ?)
            `,
            [key, label]
        );
    }

    /**
     * Deletes a user-created bucket.
     *
     * @param key - Slug
     * @returns True when a row was removed
     */
    async delete(key: string): Promise<boolean> {
        const db = getDb();
        const [result] = await db.query<ResultSetHeader>(
            `
            DELETE FROM spend_buckets
            WHERE bucket_key = ?
            `,
            [key]
        );

        return result.affectedRows > 0;
    }
}
