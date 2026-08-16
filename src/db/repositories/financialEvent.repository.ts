import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { FinancialEvent } from "../../classifiers/financial/financial.model";

export class FinancialEventRepository {
  async insert(event: FinancialEvent): Promise<number> {
    const db = getDb();
    const [result] = await db.query<ResultSetHeader>(
      `
        INSERT INTO financial_events
        (id, type, merchant, amount, currency, cash_flow, bank, account_last4, available_balance, transaction_type, source_file, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        event.id,
        event.type,
        event.merchant,
        event.amount,
        event.currency,
        event.cash_flow,
        event.bank,
        event.account_last4,
        event.available_balance,
        event.transaction_type,
        event.source_file,
        event.created_at,
        event.updated_at,
      ]
    );

    return result.affectedRows;
  }

  async findPendingClassification(classifier: string, version: string, limit = 100): Promise<FinancialEvent[]> {
    const db = getDb();
    const [rows] = await db.query<RowDataPacket[]>(
      `
        SELECT *
        FROM financial_events
        WHERE NOT EXISTS (
            SELECT 1
            FROM sms_analysis a
            WHERE a.sms_id = financial_events.id
              AND a.classifier = ?
              AND a.classifier_version = ?
        )
        ORDER BY financial_events.id
        LIMIT ?
      `,
      [classifier, version, limit]
    );

    return rows as FinancialEvent[];
  }
}