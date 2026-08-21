import { getDb } from "../mariaConnection";
import { RowDataPacket } from "mysql2";

/**
 * Manual "mark as paid" rows for due reminders (not Firefly posts).
 */
export class DueMarkRepository {
    /**
     * Reminder keys currently marked paid.
     */
    async listKeys(): Promise<Set<string>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT reminder_key
            FROM due_marks
            `
        );

        return new Set(
            rows
                .map((row) => String(row.reminder_key ?? "").trim())
                .filter((key) => key.length > 0)
        );
    }

    /**
     * Upserts a paid mark for this due cycle.
     *
     * @param reminderKey - `dueReminderKey` for the bill
     * @param smsId - SMS id of the due card that was marked
     */
    async markPaid(reminderKey: string, smsId: number): Promise<void> {
        const db = getDb();
        await db.query(
            `
            INSERT INTO due_marks (reminder_key, sms_id, marked_paid_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                sms_id = VALUES(sms_id),
                marked_paid_at = CURRENT_TIMESTAMP
            `,
            [reminderKey, smsId]
        );
    }

    /**
     * Removes a manual paid mark.
     *
     * @param reminderKey - `dueReminderKey` for the bill
     */
    async unmarkPaid(reminderKey: string): Promise<void> {
        const db = getDb();
        await db.query(
            `
            DELETE FROM due_marks
            WHERE reminder_key = ?
            `,
            [reminderKey]
        );
    }
}
