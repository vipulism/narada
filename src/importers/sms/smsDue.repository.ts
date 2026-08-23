import { RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import {
    isCardPaymentAckRow,
    isDueKnowledgeRow,
    isUtilityDuePaymentRow,
} from "../../classifiers/financial/financial.due";

/** Analysis row that can become a due knowledge item. */
export interface DueAnalysisSource {
    smsId: number;
    occurredAt: Date;
    body: string;
    address: string;
    classifier: string;
    classifierVersion: string;
    extractedData: Record<string, unknown>;
    subcategory?: string | null;
}

/** Pagination and filters for GET /knowledge?kind=due */
export interface ListDueOptions {
    page: number;
    limit: number;
    last4?: string;
    bank?: string;
    from?: Date;
    to?: Date;
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
     * @param options - Page, last4, bank, from/to, classifier identity
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
            items: rows.flatMap((row) => dueSourceIfReminder(row)),
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

    /**
     * Lists credit-card received/credited payment acks for matching dues.
     *
     * @param options - Cap, optional last4, classifier identity
     */
    async listCardPaymentAcks(options: {
        limit: number;
        last4?: string;
        classifier: string;
        classifierVersion: string;
    }): Promise<DueAnalysisSource[]> {
        const db = getDb();
        const { whereSql, params } = paymentAckWhere(options);

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
            ${whereSql}
            ORDER BY s.received_at DESC, s.id DESC
            LIMIT ?
            `,
            [...params, options.limit]
        );

        return rows.flatMap((row) => {
            const source = rowToSource(row);
            const cashFlow =
                typeof source.extractedData.cashFlow === "string"
                    ? source.extractedData.cashFlow
                    : undefined;

            if (!isCardPaymentAckRow(asOptionalString(row.subcategory), cashFlow, source.body)) {
                return [];
            }

            return [source];
        });
    }

    /**
     * Lists IGL payment confirmations and IGL merchant expense SMS for due matching.
     *
     * @param options - Cap and classifier identity
     */
    async listUtilityDuePayments(options: {
        limit: number;
        classifier: string;
        classifierVersion: string;
    }): Promise<DueAnalysisSource[]> {
        const db = getDb();
        const { whereSql, params } = utilityPaymentWhere(options);

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
            ${whereSql}
            ORDER BY s.received_at DESC, s.id DESC
            LIMIT ?
            `,
            [...params, options.limit]
        );

        return rows.flatMap((row) => {
            const source = rowToSource(row);
            const merchant =
                typeof source.extractedData.merchant === "string"
                    ? source.extractedData.merchant
                    : null;

            if (!isUtilityDuePaymentRow(source.subcategory, source.body, merchant)) {
                return [];
            }

            return [source];
        });
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
            (
                JSON_EXTRACT(a.extracted_data, '$.dueDate') IS NOT NULL
                AND JSON_TYPE(JSON_EXTRACT(a.extracted_data, '$.dueDate')) <> 'NULL'
                AND JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.dueDate')) <> ''
            )
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
            OR UPPER(s.body) LIKE '%IS PENDING AGAINST%'
            OR UPPER(s.body) LIKE '%PENDING AGAINST%'
        )`,
        "UPPER(s.body) NOT LIKE '%RECEIVED TOWARDS YOUR CREDIT CARD%'",
        "UPPER(s.body) NOT LIKE '%CREDITED TO YOUR CARD%'",
        "UPPER(s.body) NOT LIKE '%RECEIVED A PAYMENT%'",
        "UPPER(s.body) NOT LIKE '%WE HAVE RECEIVED%'",
        "UPPER(s.body) NOT LIKE '%WAS RECEIVED FOR%'",
        "UPPER(s.body) NOT LIKE '%CONFIRM RECEIPT%'",
        "UPPER(s.body) NOT LIKE '%RECEIVED AND CREDITED%'",
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

    if (options.from) {
        where.push("s.received_at >= ?");
        params.push(options.from);
    }

    if (options.to) {
        where.push("s.received_at <= ?");
        params.push(options.to);
    }

    return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

function paymentAckWhere(options: {
    last4?: string;
    classifier: string;
    classifierVersion: string;
}): { whereSql: string; params: unknown[] } {
    const where = [
        "a.classifier = ?",
        "a.classifier_version = ?",
        "a.category = 'FINANCIAL'",
        "a.subcategory = 'bill'",
        "JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.cashFlow')) = 'NEUTRAL'",
        `(
            UPPER(s.body) LIKE '%RECEIVED TOWARDS%'
            OR UPPER(s.body) LIKE '%CREDITED TO YOUR CARD%'
            OR UPPER(s.body) LIKE '%CREDITED TO YOUR %CARD%'
            OR UPPER(s.body) LIKE '%WAS CREDITED TO YOUR CARD%'
            OR UPPER(s.body) LIKE '%WE HAVE RECEIVED%'
            OR UPPER(s.body) LIKE '%CONFIRM RECEIPT%'
            OR UPPER(s.body) LIKE '%RECEIVED A PAYMENT%'
            OR UPPER(s.body) LIKE '%RECEIVED AND CREDITED%'
        )`,
        "UPPER(s.body) NOT LIKE '%SPENT%'",
        "UPPER(s.body) NOT LIKE '%DEBITED%'",
    ];
    const params: unknown[] = [options.classifier, options.classifierVersion];

    if (options.last4) {
        where.push("JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.accountLast4')) = ?");
        params.push(options.last4);
    }

    return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

function utilityPaymentWhere(options: {
    classifier: string;
    classifierVersion: string;
}): { whereSql: string; params: unknown[] } {
    const where = [
        "a.classifier = ?",
        "a.classifier_version = ?",
        "a.category = 'FINANCIAL'",
        "a.subcategory = 'expense'",
        `(
            (
                UPPER(s.body) LIKE '%RECEIVED AGAINST%'
                AND (UPPER(s.body) LIKE '%BP NO%' OR UPPER(s.body) LIKE '%IGL%')
            )
            OR JSON_UNQUOTE(JSON_EXTRACT(a.extracted_data, '$.merchant')) IN ('IGL', 'Indraprastha Ga')
            OR UPPER(s.body) LIKE '%INDRAPRASTHA GA%'
            OR (
                UPPER(s.body) LIKE '%IGL%'
                AND (
                    UPPER(s.body) LIKE '%SPENT%'
                    OR UPPER(s.body) LIKE '%DEBITED%'
                    OR UPPER(s.body) LIKE '%RECEIVED AGAINST%'
                )
            )
        )`,
    ];
    const params: unknown[] = [options.classifier, options.classifierVersion];

    return { whereSql: `WHERE ${where.join(" AND ")}`, params };
}

function dueSourceIfReminder(row: RowDataPacket): DueAnalysisSource[] {
    const source = rowToSource(row);
    const cashFlow =
        typeof source.extractedData.cashFlow === "string"
            ? source.extractedData.cashFlow
            : undefined;

    if (!isDueKnowledgeRow("bill", cashFlow, source.body)) {
        return [];
    }

    return [source];
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
        subcategory: asOptionalString(row.subcategory) ?? null,
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
