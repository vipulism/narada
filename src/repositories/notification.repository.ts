import { getDb } from "../db/mariaConnection";

export type NotificationStatus = "sent" | "failed";

export interface SaveNotificationInput {
    eventId: string;
    notifierType: string;
    status: NotificationStatus;
    errorMessage?: string | null;
}

export const saveNotificationResult = async (
    input: SaveNotificationInput
) => {
    const db = getDb();

    const sql = `
    INSERT INTO narada_notifications (
      event_id,
      notifier_type,
      status,
      error_message,
      sent_at
    )
    VALUES (?, ?, ?, ?, ?);
  `;

    await db.execute(sql, [
        input.eventId,
        input.notifierType,
        input.status,
        input.errorMessage ?? null,
        input.status === "sent" ? new Date() : null,
    ]);
};