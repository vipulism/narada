import { getDb } from "../mariaConnection";
import { ResultSetHeader, RowDataPacket } from "mysql2";

/**
 * IST calendar days the daily Telegram digest has already been sent.
 */
export class AttentionDigestRepository {
    /**
     * True when a digest was recorded for this IST day (`YYYY-MM-DD`).
     *
     * @param sentOn - IST calendar day
     */
    async hasSentOn(sentOn: string): Promise<boolean> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT sent_on
            FROM attention_digest_days
            WHERE sent_on = ?
            LIMIT 1
            `,
            [sentOn]
        );

        return rows.length > 0;
    }

    /**
     * Records a successful send so catch-up and deploys do not double-fire.
     *
     * @param sentOn - IST calendar day
     */
    async markSent(sentOn: string): Promise<void> {
        const db = getDb();
        await db.query<ResultSetHeader>(
            `
            INSERT IGNORE INTO attention_digest_days (sent_on)
            VALUES (?)
            `,
            [sentOn]
        );
    }
}
