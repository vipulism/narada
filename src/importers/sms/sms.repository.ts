import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { SmsMessage } from "./sms.model";

interface HashRow extends RowDataPacket {
  hash: string;
}

export class SmsRepository {
  private readonly db = getDb();

  async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) {
      return new Set();
    }

    const placeholders = hashes.map(() => "?").join(",");

    const [rows] = await this.db.query<HashRow[]>(
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
    if (messages.length === 0) {
      return 0;
    }

    const values = messages.map((sms) => [
      sms.hash,
      sms.address,
      sms.contactName ?? null,
      sms.body,
      sms.smsType,
      sms.receivedAt,
      sms.sourceFile ?? null,
      JSON.stringify(sms.rawAttributes),
    ]);

    const [result] = await this.db.query<ResultSetHeader>(
      `
        INSERT INTO sms_messages
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

    return result.affectedRows;
  }
}