import { getDb } from "../mariaConnection";
import { RowDataPacket } from "mysql2";
import { type MerchantAlias } from "../../classifiers/financial/financial.spend";

/**
 * User merchant rename / merge map (`merchant_aliases`).
 */
export class MerchantAliasRepository {
    /**
     * Pattern catalog key → target key + display name.
     *
     * @returns Alias map used by GET /merchants
     */
    async listAll(): Promise<Map<string, MerchantAlias>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT from_key, to_key, label
            FROM merchant_aliases
            `
        );
        const aliases = new Map<string, MerchantAlias>();

        for (const row of rows) {
            const fromKey = String(row.from_key ?? "").trim();
            const toKey = String(row.to_key ?? "").trim();
            const label = String(row.label ?? "").trim();

            if (!fromKey || !toKey) {
                continue;
            }

            aliases.set(fromKey, {
                toKey,
                label: label || toKey,
            });
        }

        return aliases;
    }

    /**
     * Points one catalog key at another (merge) or at itself (rename).
     *
     * @param fromKey - Pattern catalog id
     * @param toKey - Target catalog id
     * @param label - Display name
     */
    async upsert(fromKey: string, toKey: string, label: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            INSERT INTO merchant_aliases (from_key, to_key, label)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                to_key = VALUES(to_key),
                label = VALUES(label),
                updated_at = CURRENT_TIMESTAMP
            `,
            [fromKey, toKey, label]
        );
    }

    /**
     * Rewrites aliases that targeted `fromKey` so they follow `toKey`.
     *
     * @param fromKey - Old target
     * @param toKey - New target
     */
    async retarget(fromKey: string, toKey: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            UPDATE merchant_aliases
            SET to_key = ?, updated_at = CURRENT_TIMESTAMP
            WHERE to_key = ?
              AND from_key <> ?
            `,
            [toKey, fromKey, toKey]
        );
    }

    /**
     * Removes a rename / merge for one catalog key.
     *
     * @param fromKey - Pattern catalog id
     */
    async delete(fromKey: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            DELETE FROM merchant_aliases
            WHERE from_key = ?
            `,
            [fromKey]
        );
    }
}
