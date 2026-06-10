import { getDb } from "../db/mariaConnection";
import { NaradaEvent } from "../events/naradaEvent";

export const saveReceivedEvent = async (event: NaradaEvent) => {

    const db = getDb();
    const sql = `
    INSERT INTO narada_events (
      id,
      source,
      type,
      severity,
      message,
      status,
      metadata,
      created_at,
      service_id,
      service_name,
      service_critical
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const values = [
        event.id,
        event.source,
        event.type,
        event.severity,
        event.message,
        "received",
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.timestamp ? new Date(event.timestamp) : new Date(),
        event.service?.id ?? null,
        event.service?.name ?? null,
        event.service?.critical ?? null,
    ];

    await db.execute(sql, values);

    return event.id;
}


export async function markEventProcessed(eventId: string) {

    const db = getDb();
    const sql = `
    UPDATE narada_events 
    SET status = 'processed',
        processed_at = NOW()
    WHERE id = ?
    `;

  await db.execute(sql, [eventId]);
 
}

export const markEventFailed = async (eventId: string, error: unknown) => {
    const db = getDb();
  
    const errorMessage =
      error instanceof Error ? error.message : String(error);
  
    const sql = `
      UPDATE narada_events
      SET status = 'failed',
          processed_at = NOW(),
          metadata = JSON_SET(
            COALESCE(metadata, JSON_OBJECT()),
            '$.error',
            ?
          )
      WHERE id = ?
    `;
  
    await db.execute(sql, [errorMessage, eventId]);
  };