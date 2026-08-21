import { RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { isDueKnowledgeRow } from "../../classifiers/financial/financial.due";

/** Analysis row that can become a due knowledge item. */
export interface DueAnalysisSource {
    smsId: number;
    occurredAt: Date;
    body: string;
    address: string;
    classifier: string;
    classifierVersion: string;
    extractedData: Record<string, unknown>;
}

/** Pagination and filters for GET /knowledge?kind=due */
export interface ListDueOptions {
    page: number;
    limit: number;
    last4?: string;
    bank?: string;
    classifier: string;
    classifierVersion: string;
}

/**
 * Reads bill+NEUTRAL due reminders from sms_analysis (never in financial_events).
 */
export class SmsDueRepository {
    /**
     * Lists due reminders for the preferred classifier version.
     *
     * @param options - Page, last4, bank, classifier identity
     */
    async list(options: ListDueOptions): Promise<{ items: DueAnalysisSource[]; total: number }> {
        const db = getDb();
        const { whereSql, params } = dueWhere(options);
        const offset = (options.page - 1) * options.limit;

        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                s.id AS sms_id,
                s.received_at,
                s.body,
                s.address,
                a.classifier,
                a.classifier_version,
                a.extracted_data
            FROM sms_analysis a
            JOIN sms_messages s ON s.id = a.sms_id
            ${whereSql}
            ORDER BY s.received_at DESC, s.id DESC
            LIMIT ? OFFSET ?
            `,
            [...params, options.limit, offset]
        );

        const [countRows] = await db.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS total
            FROM sms_analysis a
            JOIN sms_messages s ON s.id = a.sms_id
            ${whereSql}
            `,
            params
        );

        return {
            items: rows.map(rowToSource),
            total: Number(countRows[0]?.total ?? 0),
        };
    }

    /**
     * Loads one due reminder by SMS id, or null when it is not a due.
     *
     * @param smsId - sms_messages.id
     * @param classifier - Preferred classifier name
     * @param classifierVersion - Preferred classifier version
     */
    async getBySmsId(
        smsId: number,
        classifier: string,
        classifierVersion: string
    ): Promise<DueAnalysisSource | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                s.id AS sms_id,
                s.received_at,
                s.body,
                s.address,
                a.subcategory,
                a.classifier,
                a.classifier_version,
                a.extracted_data
            FROM sms_analysis a
            JOIN sms_messages s ON s.id = a.sms_id
            WHERE s.id = ?
              AND a.classifier = ?
              AND a.classifier_version = ?
            LIMIT 1
            `,
            [smsId, classifier, classifierVersion]
        );

        const row = rows[0];

        if (!row) {
            return null;
        }

        const source = rowToSource(row);
        const cashFlow =
            typeof source.extractedData.cashFlow === "string"
                ? source.extractedData.cashFlow
                : undefined;

        if (!isDueKnowledgeRow(asOptionalString(row.subcategory), cashFlow, source.body)) {
            return null;
        }

        return source;
    }
}

function dueWhere(options: ListDueOptions): { whereSql: string; params: unknown[] } {
    const where = [
        "a.classifier = ?",
        "a.classifier_version = ?",
        "a.category = 'FINANCIAL'",
        "a.subcategory = 'bill'",
        "JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.cashFlow')) = 'NEUTRAL'",
        `(
            JSON_EXTRACT(a.extracted_data, '$.dueDate') IS NOT NULL
            OR UPPER(s.body) LIKE '%IS DUE ON%'
            OR UPPER(s.body) LIKE '%IS DUE BY%'
            OR UPPER(s.body) LIKE '%IS DUE TODAY%'
            OR UPPER(s.body) LIKE '%BILL DUE%'
            OR UPPER(s.body) LIKE '%PAYMENT DUE%'
            OR UPPER(s.body) LIKE '%TO BE PAID BY%'
            OR UPPER(s.body) LIKE '%PAYABLE BY%'
            OR UPPER(s.body) LIKE '%TOTAL DUE%'
            OR UPPER(s.body) LIKE '%MIN DUE%'
            OR UPPER(s.body) LIKE '%AMT DUE%'
            OR UPPER(s.body) LIKE '%AMOUNT DUE%'
        )`,
        "UPPER(s.body) NOT LIKE '%RECEIVED TOWARDS YOUR CREDIT CARD%'",
        "UPPER(s.body) NOT LIKE '%CREDITED TO YOUR CARD%'",
        "UPPER(s.body) NOT LIKE '%SPENT%'",
        "UPPER(s.body) NOT LIKE '%DEBITED%'",
    ];
    const params: unknown[] = [options.classifier, options.classifierVersion];

    if (options.last4) {
        where.push("JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.accountLast4')) = ?");
        params.push(options.last4);
    }

    if (options.bank) {
        where.push("JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.bank')) = ?");
        params.push(options.bank);
    }

    return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

function rowToSource(row: RowDataPacket): DueAnalysisSource {
    return {
        smsId: Number(row.sms_id),
        occurredAt: new Date(row.received_at),
        body: String(row.body ?? ""),
        address: String(row.address ?? ""),
        classifier: String(row.classifier),
        classifierVersion: String(row.classifier_version),
        extractedData: parseJsonObject(row.extracted_data) ?? {},
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
