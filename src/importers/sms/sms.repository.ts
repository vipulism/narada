import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { FinancialEvent } from "../../classifiers/financial/financial.model";
import {
  ListSmsOptions,
  SmsDetail,
  SmsListItem,
  SmsMessage,
  SmsMessageWithId,
} from "./sms.model";

interface HashRow extends RowDataPacket {
  hash: string;
}

/**
 * Persists SMS Backup messages and serves GET /sms reads.
 */
export class SmsRepository {

  // Safe default batch limit to prevent hitting max_allowed_packet limits
  private readonly BATCH_SIZE = 1000;

  /**
   * Returns hashes already stored in `sms_messages`.
   * Queries in batches so a full SMS Backup re-parse does not blow `max_allowed_packet`.
   *
   * @param hashes - Candidate message hashes from the XML
   */
  async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    const db = getDb();
    const found = new Set<string>();

    if (hashes.length === 0) {
      return found;
    }

    for (let i = 0; i < hashes.length; i += this.BATCH_SIZE) {
      const chunk = hashes.slice(i, i + this.BATCH_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      const [rows] = await db.query<HashRow[]>(
        `
          SELECT hash
          FROM sms_messages
          WHERE hash IN (${placeholders})
        `,
        chunk
      );

      for (const row of rows) {
        found.add(row.hash);
      }
    }

    return found;
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

    /**
     * Lists SMS newest-first with preferred classifier analysis joined.
     *
     * @param options - Page, filters, and preferred classifier identity
     */
    async list(
        options: ListSmsOptions
    ): Promise<{ items: SmsListItem[]; total: number }> {
        const db = getDb();
        const offset = (options.page - 1) * options.limit;
        const { whereSql, params, joinParams } = smsListWhere(options);

        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                s.id,
                s.address,
                s.contact_name,
                s.body,
                s.sms_type,
                s.received_at,
                s.source_file,
                a.category,
                a.subcategory,
                a.confidence
            FROM sms_messages s
            LEFT JOIN sms_analysis a ON a.id = (
                SELECT a2.id
                FROM sms_analysis a2
                WHERE a2.sms_id = s.id
                ORDER BY
                    (a2.classifier = ? AND a2.classifier_version = ?) DESC,
                    a2.classified_at DESC,
                    a2.id DESC
                LIMIT 1
            )
            ${whereSql}
            ORDER BY s.received_at DESC, s.id DESC
            LIMIT ? OFFSET ?
            `,
            [...joinParams, ...params, options.limit, offset]
        );

        const [countRows] = await db.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS total
            FROM sms_messages s
            LEFT JOIN sms_analysis a ON a.id = (
                SELECT a2.id
                FROM sms_analysis a2
                WHERE a2.sms_id = s.id
                ORDER BY
                    (a2.classifier = ? AND a2.classifier_version = ?) DESC,
                    a2.classified_at DESC,
                    a2.id DESC
                LIMIT 1
            )
            ${whereSql}
            `,
            [...joinParams, ...params]
        );

        return {
            items: rows.map(rowToListItem),
            total: Number(countRows[0]?.total ?? 0),
        };
    }

    /**
     * Loads one SMS with analysis and posted financial event when present.
     *
     * @param id - `sms_messages.id`
     * @param preferredClassifier - Classifier name to prefer on join
     * @param preferredVersion - Classifier version to prefer on join
     */
    async findById(
        id: number,
        preferredClassifier: string,
        preferredVersion: string
    ): Promise<SmsDetail | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                s.id,
                s.address,
                s.contact_name,
                s.body,
                s.sms_type,
                s.received_at,
                s.source_file,
                s.hash,
                s.raw_attributes,
                a.category,
                a.subcategory,
                a.confidence,
                a.extracted_data,
                fe.sms_id AS fe_sms_id,
                fe.kind AS fe_kind,
                fe.cash_flow AS fe_cash_flow,
                fe.amount AS fe_amount,
                fe.currency AS fe_currency,
                fe.account_last4 AS fe_account_last4,
                fe.counterparty_last4 AS fe_counterparty_last4,
                fe.account_name AS fe_account_name,
                fe.bank AS fe_bank,
                fe.merchant AS fe_merchant,
                fe.transaction_type AS fe_transaction_type,
                fe.occurred_at AS fe_occurred_at,
                fe.classifier AS fe_classifier,
                fe.classifier_version AS fe_classifier_version,
                fe.firefly_transaction_id AS fe_firefly_transaction_id,
                fe.firefly_pushed_at AS fe_firefly_pushed_at
            FROM sms_messages s
            LEFT JOIN sms_analysis a ON a.id = (
                SELECT a2.id
                FROM sms_analysis a2
                WHERE a2.sms_id = s.id
                ORDER BY
                    (a2.classifier = ? AND a2.classifier_version = ?) DESC,
                    a2.classified_at DESC,
                    a2.id DESC
                LIMIT 1
            )
            LEFT JOIN financial_events fe ON fe.sms_id = s.id
            WHERE s.id = ?
            LIMIT 1
            `,
            [preferredClassifier, preferredVersion, id]
        );

        return rows[0] ? rowToDetail(rows[0]) : null;
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

function smsListWhere(options: ListSmsOptions): {
    whereSql: string;
    params: unknown[];
    joinParams: unknown[];
} {
    const where: string[] = [];
    const params: unknown[] = [];

    if (options.category) {
        where.push("a.category = ?");
        params.push(options.category);
    }

    if (options.subcategory) {
        where.push("a.subcategory = ?");
        params.push(options.subcategory);
    }

    if (options.address) {
        where.push("s.address = ?");
        params.push(options.address);
    }

    if (options.from) {
        where.push("s.received_at >= ?");
        params.push(options.from);
    }

    if (options.to) {
        where.push("s.received_at <= ?");
        params.push(options.to);
    }

    return {
        whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
        params,
        joinParams: [options.preferredClassifier, options.preferredVersion],
    };
}

function rowToListItem(row: RowDataPacket): SmsListItem {
    return {
        id: Number(row.id),
        address: String(row.address),
        ...(asOptionalString(row.contact_name)
            ? { contactName: asOptionalString(row.contact_name) }
            : {}),
        body: String(row.body ?? ""),
        smsType: Number(row.sms_type),
        receivedAt: new Date(row.received_at),
        ...(asOptionalString(row.source_file)
            ? { sourceFile: asOptionalString(row.source_file) }
            : {}),
        ...(asOptionalString(row.category)
            ? { category: asOptionalString(row.category) }
            : {}),
        ...(asOptionalString(row.subcategory)
            ? { subcategory: asOptionalString(row.subcategory) }
            : {}),
        ...(row.confidence != null ? { confidence: Number(row.confidence) } : {}),
    };
}

function rowToDetail(row: RowDataPacket): SmsDetail {
    const extractedData = parseJsonObject(row.extracted_data);
    const financialEvent = row.fe_sms_id == null ? undefined : rowToFinancialEvent(row);

    return {
        ...rowToListItem(row),
        hash: String(row.hash),
        rawAttributes: parseJsonObject(row.raw_attributes),
        ...(extractedData ? { extractedData } : {}),
        ...(financialEvent ? { financialEvent } : {}),
    };
}

function rowToFinancialEvent(row: RowDataPacket): FinancialEvent {
    return {
        smsId: Number(row.fe_sms_id),
        kind: String(row.fe_kind),
        cashFlow: String(row.fe_cash_flow),
        amount: Number(row.fe_amount),
        currency: String(row.fe_currency),
        accountLast4: asOptionalString(row.fe_account_last4),
        counterpartyLast4: asOptionalString(row.fe_counterparty_last4),
        accountName: asOptionalString(row.fe_account_name),
        bank: asOptionalString(row.fe_bank),
        merchant: asOptionalString(row.fe_merchant),
        transactionType: asOptionalString(row.fe_transaction_type),
        occurredAt: new Date(row.fe_occurred_at),
        classifier: String(row.fe_classifier),
        classifierVersion: String(row.fe_classifier_version),
        fireflyTransactionId: asOptionalString(row.fe_firefly_transaction_id),
        fireflyPushedAt: row.fe_firefly_pushed_at
            ? new Date(row.fe_firefly_pushed_at)
            : undefined,
    };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    if (typeof value === "string" && value.length > 0) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return null;
        }
    }

    return null;
}

function asOptionalString(value: unknown): string | undefined {
    if (value == null) {
        return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
}