import { getDb } from "../db/mariaConnection";

export const getServicesStatus = async () => {
    const db = getDb();
    const sql = `
    SELECT
      e.service_id AS id,
      e.source,
      e.status,
      e.severity,
      e.service_name AS name,
      e.service_critical AS critical,
      e.message,
      e.processed_at AS lastEventAt
    FROM narada_events e
    INNER JOIN (
      SELECT service_id, MAX(processed_at) AS latest_processed_at
      FROM narada_events
      WHERE service_id IS NOT NULL
      GROUP BY service_id
    ) latest
      ON e.service_id = latest.service_id
      AND e.processed_at = latest.latest_processed_at
    ORDER BY e.processed_at DESC; 
    `;

    const [rows] = await db.execute(sql);

    return rows;
}