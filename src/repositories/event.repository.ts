import { getDb } from "../db/mariaConnection";
import { NaradaEvent } from "../events/naradaEvent";


export interface GetEventsOptions {
  page: number;
  limit: number;
  status?: string;
  type?: string;
  from?: Date;
  to?: Date;
}

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




export const getEvents = async (options: GetEventsOptions): Promise<{ items: NaradaEvent[], total: number }> => {

  const db = getDb();

  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    where.push("status = ?");
    params.push(options.status);
  }

  if (options.type) {
    where.push("type = ?");
    params.push(options.type);
  }

  if (options.from) {
    where.push("created_at >= ?");
    params.push(options.from);
  }

  if (options.to) {
    where.push("created_at <= ?");
    params.push(options.to);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
                SELECT *
                FROM narada_events
                ${whereSql}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?;
            `;


  const countSql = `
            SELECT COUNT(*) AS total
            FROM narada_events
            ${whereSql};
          `;

  const [rows] = await db.query(sql, [...params, limit, offset]);
  const [countRows] = await db.query(countSql, params);

  const total = Array.isArray(countRows)
    ? Number((countRows as any[])[0]?.total ?? 0)
    : 0;

  return {
    items: rows as NaradaEvent[],
    total,
  };

}
export const getEventById = async (eventId: string) => {

  const db = getDb();

  const sql = `
            SELECT *
            FROM narada_events
            WHERE id = ?;
            `;

  const [rows] = await db.query(sql, [eventId]);
  const events = rows as NaradaEvent[];

  return events[0] || null;
}

/** Homelab event row for GET /timeline. */
export interface TimelineEventRow {
  id: string;
  source: string;
  eventType: string;
  severity: string;
  message: string;
  status: string;
  occurredAt: Date;
  serviceId: string | null;
  serviceName: string | null;
  critical: boolean | null;
}

/**
 * Newest narada_events for the mixed timeline (created_at window).
 *
 * @param options - Optional from/to and fetch cap
 */
export async function listEventsForTimeline(options: {
  from?: Date;
  to?: Date;
  limit: number;
}): Promise<TimelineEventRow[]> {
  const result = await getEvents({
    page: 1,
    limit: options.limit,
    from: options.from,
    to: options.to,
  });

  return (result.items as unknown as Array<Record<string, unknown>>).map(rowToTimelineEvent);
}

function rowToTimelineEvent(row: Record<string, unknown>): TimelineEventRow {
  const createdAt = row.created_at ?? row.timestamp ?? row.occurredAt;

  return {
    id: String(row.id),
    source: String(row.source ?? ""),
    eventType: String(row.type ?? ""),
    severity: String(row.severity ?? ""),
    message: String(row.message ?? ""),
    status: String(row.status ?? ""),
    occurredAt: createdAt instanceof Date ? createdAt : new Date(String(createdAt)),
    serviceId: row.service_id != null ? String(row.service_id) : null,
    serviceName: row.service_name != null ? String(row.service_name) : null,
    critical:
      row.service_critical == null ? null : Boolean(row.service_critical),
  };
}

