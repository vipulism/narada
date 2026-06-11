import { getDb } from "../db/mariaConnection";

export const getServicesStatus = async () => {
    const db = getDb();
    const sql = `
    SELECT service_id as id, source, status,severity, service_name as name, service_critical, processed_at 
    FROM narada_events
    ORDER BY processed_at DESC LIMIT 1; 
    `;

    return await db.execute(sql);
}