import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { SmsMessage, SmsMessageWithId } from "./sms.model";

interface HashRow extends RowDataPacket {
  hash: string;
}

export class SmsRepository {

  // Safe default batch limit to prevent hitting max_allowed_packet limits
  private readonly BATCH_SIZE = 1000;

  async findExistingHashes(hashes: string[]): Promise<Set<string>> {

    const db = getDb();

    if (hashes.length === 0) {
      return new Set();
    }

    const placeholders = hashes.map(() => "?").join(",");

    const [rows] = await db.query<HashRow[]>(
      `
        SELECT hash
        FROM sms_messages
        WHERE hash IN (${placeholders})
      `,
      hashes
    );

    return new Set(rows.map((row) => row.hash));
  }

  async insertMany(messages: SmsMessage[]): Promise<number> {

    const db = getDb();
    if (messages.length === 0) {
      return 0;
    }

    let totalInserted = 0;

    // Process items in chunks/batches safely
    for (let i = 0; i < messages.length; i += this.BATCH_SIZE) {
      const chunk = messages.slice(i, i + this.BATCH_SIZE);
      
      const values = chunk.map((sms) => [
        sms.hash,
        sms.address,
        sms.contactName ?? null,
        sms.body,
        sms.smsType,
        sms.receivedAt,
        sms.sourceFile ?? null,
        JSON.stringify(sms.rawAttributes),
      ]);

      // Using INSERT IGNORE skips duplicate keys instead of throwing errors
      const [result] = await db.query<ResultSetHeader>(
        `
          INSERT IGNORE INTO sms_messages
          (
            hash,
            address,
            contact_name,
            body,
            sms_type,
            received_at,
            source_file,
            raw_attributes
          )
          VALUES ?
        `,
        [values]
      );

      // In MySQL INSERT IGNORE operations, affectedRows exactly matches the newly created rows
      totalInserted += result.affectedRows;
    }

    return totalInserted;
  }

  async findPendingClassification(classifier: string, version: string, limit = 100): Promise<SmsMessageWithId[]> {

    const db = getDb();
    const [rows] = await db.query<any[]>(
        `
        SELECT *
        FROM sms_messages s
        WHERE NOT EXISTS (
            SELECT 1
            FROM sms_analysis a
            WHERE a.sms_id = s.id
              AND a.classifier = ?
              AND a.classifier_version = ?
        )
        ORDER BY s.id
        LIMIT ?
        `,
        [classifier, version, limit]
    );

    return rows as SmsMessageWithId[];

}
}