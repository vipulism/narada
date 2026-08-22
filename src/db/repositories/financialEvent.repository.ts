import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { FinancialEvent } from "../../classifiers/financial/financial.model";

/**
 * Persists posted financial events derived from sms_analysis.
 */
export class FinancialEventRepository {
    /**
     * Replaces every financial_events row with the given set.
     *
     * @param events - Posted transactions for the current classifier version
     */
    async replaceAll(events: FinancialEvent[]): Promise<void> {
        const db = getDb();
        const pushed = await this.listPushedBySmsId();

        await db.query("DELETE FROM financial_events");

        const batchSize = 100;

        for (let offset = 0; offset < events.length; offset += batchSize) {
            const batch = events.slice(offset, offset + batchSize);
            const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
            const values = batch.flatMap((event) => {
                const prior = pushed.get(event.smsId);

                return [
                    event.smsId,
                    event.kind,
                    event.cashFlow,
                    event.amount,
                    event.currency,
                    event.accountLast4 ?? null,
                    event.counterpartyLast4 ?? null,
                    event.accountName ?? null,
                    event.bank ?? null,
                    event.merchant ?? null,
                    event.transactionType ?? null,
                    event.occurredAt,
                    event.classifier,
                    event.classifierVersion,
                    event.fireflyTransactionId ?? prior?.id ?? null,
                    event.fireflyPushedAt ?? prior?.pushedAt ?? null,
                ];
            });

            await db.query<ResultSetHeader>(
                `
                INSERT INTO financial_events (
                    sms_id, kind, cash_flow, amount, currency,
                    account_last4, counterparty_last4, account_name, bank, merchant,
                    transaction_type, occurred_at, classifier, classifier_version,
                    firefly_transaction_id, firefly_pushed_at
                )
                VALUES ${placeholders}
                `,
                values
            );
        }
    }

    /**
     * Stores the Firefly journal id after a successful POST.
     *
     * @param smsId - financial_events.sms_id
     * @param fireflyTransactionId - Firefly transaction journal id
     */
    async markPushed(smsId: number, fireflyTransactionId: string): Promise<void> {
        const db = getDb();

        await db.query(
            `
            UPDATE financial_events
            SET firefly_transaction_id = ?, firefly_pushed_at = NOW()
            WHERE sms_id = ?
            `,
            [fireflyTransactionId, smsId]
        );
    }

    private async listPushedBySmsId(): Promise<
        Map<number, { id: string; pushedAt: Date }>
    > {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT sms_id, firefly_transaction_id, firefly_pushed_at
            FROM financial_events
            WHERE firefly_transaction_id IS NOT NULL
            `
        );
        const pushed = new Map<number, { id: string; pushedAt: Date }>();

        for (const row of rows) {
            const id = asOptionalString(row.firefly_transaction_id);

            if (!id) {
                continue;
            }

            pushed.set(Number(row.sms_id), {
                id,
                pushedAt: new Date(row.firefly_pushed_at),
            });
        }

        return pushed;
    }

    /**
     * Counts events grouped by kind.
     */
    async countByKind(): Promise<Array<{ kind: string; n: number }>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT kind, COUNT(*) AS n
            FROM financial_events
            GROUP BY kind
            ORDER BY n DESC
            `
        );

        return rows.map((row) => ({ kind: String(row.kind), n: Number(row.n) }));
    }

    /**
     * Returns every financial event, oldest first.
     */
    async listAll(): Promise<FinancialEvent[]> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                sms_id,
                kind,
                cash_flow,
                amount,
                currency,
                account_last4,
                counterparty_last4,
                account_name,
                bank,
                merchant,
                transaction_type,
                occurred_at,
                classifier,
                classifier_version,
                firefly_transaction_id,
                firefly_pushed_at
            FROM financial_events
            ORDER BY occurred_at ASC, sms_id ASC
            `
        );

        return rows.map(rowToEvent);
    }

    /**
     * Lists posted financial events newest-first for GET /knowledge.
     *
     * @param options - Page and optional kind / last4 / bank / pushed filters
     */
    async listPage(
        options: ListFinancialEventsOptions
    ): Promise<{ items: FinancialEvent[]; total: number }> {
        const db = getDb();
        const offset = (options.page - 1) * options.limit;
        const { whereSql, params } = financialEventWhere(options);

        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                sms_id,
                kind,
                cash_flow,
                amount,
                currency,
                account_last4,
                counterparty_last4,
                account_name,
                bank,
                merchant,
                transaction_type,
                occurred_at,
                classifier,
                classifier_version,
                firefly_transaction_id,
                firefly_pushed_at
            FROM financial_events
            ${whereSql}
            ORDER BY occurred_at DESC, sms_id DESC
            LIMIT ? OFFSET ?
            `,
            [...params, options.limit, offset]
        );

        const [countRows] = await db.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS total
            FROM financial_events
            ${whereSql}
            `,
            params
        );

        return {
            items: rows.map(rowToEvent),
            total: Number(countRows[0]?.total ?? 0),
        };
    }

    /**
     * Loads one posted financial event by SMS id.
     *
     * @param smsId - `financial_events.sms_id`
     */
    async getBySmsId(smsId: number): Promise<FinancialEvent | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                sms_id,
                kind,
                cash_flow,
                amount,
                currency,
                account_last4,
                counterparty_last4,
                account_name,
                bank,
                merchant,
                transaction_type,
                occurred_at,
                classifier,
                classifier_version,
                firefly_transaction_id,
                firefly_pushed_at
            FROM financial_events
            WHERE sms_id = ?
            LIMIT 1
            `,
            [smsId]
        );

        return rows[0] ? rowToEvent(rows[0]) : null;
    }

    /**
     * Unpushed posted events, newest first. Used by GET /knowledge?kind=exception.
     *
     * @param options - Optional last4 / bank filters
     */
    async listUnpushed(options: {
        last4?: string;
        bank?: string;
        from?: Date;
        to?: Date;
    }): Promise<FinancialEvent[]> {
        const db = getDb();
        const { whereSql, params } = financialEventWhere({
            page: 1,
            limit: 1,
            last4: options.last4,
            bank: options.bank,
            from: options.from,
            to: options.to,
            pushed: false,
        });

        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                sms_id,
                kind,
                cash_flow,
                amount,
                currency,
                account_last4,
                counterparty_last4,
                account_name,
                bank,
                merchant,
                transaction_type,
                occurred_at,
                classifier,
                classifier_version,
                firefly_transaction_id,
                firefly_pushed_at
            FROM financial_events
            ${whereSql}
            ORDER BY occurred_at DESC, sms_id DESC
            `,
            params
        );

        return rows.map(rowToEvent);
    }

    /**
     * Posted `expense` rows whose `occurred_at` falls in `[from, to]` (inclusive).
     *
     * @param from - Range start
     * @param to - Range end
     */
    async listExpensesInRange(from: Date, to: Date): Promise<FinancialEvent[]> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                sms_id,
                kind,
                cash_flow,
                amount,
                currency,
                account_last4,
                counterparty_last4,
                account_name,
                bank,
                merchant,
                transaction_type,
                occurred_at,
                classifier,
                classifier_version,
                firefly_transaction_id,
                firefly_pushed_at
            FROM financial_events
            WHERE kind = 'expense'
              AND occurred_at >= ?
              AND occurred_at <= ?
            ORDER BY occurred_at ASC, sms_id ASC
            `,
            [from, to]
        );

        return rows.map(rowToEvent);
    }

    /**
     * Expense totals grouped by the raw merchant string (for the merchants page).
     *
     * @returns One row per distinct `financial_events.merchant`
     */
    async listExpenseMerchantTotals(): Promise<
        Array<{
            merchant: string;
            txCount: number;
            pushedCount: number;
            sampleSmsIds: number[];
            totalAmount: number;
            lastSeenAt: Date;
        }>
    > {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                COALESCE(NULLIF(TRIM(merchant), ''), 'Unknown') AS merchant,
                COUNT(*) AS tx_count,
                SUM(CASE WHEN firefly_transaction_id IS NOT NULL THEN 1 ELSE 0 END) AS pushed_count,
                SUM(amount) AS total_amount,
                MAX(occurred_at) AS last_seen,
                SUBSTRING_INDEX(
                    GROUP_CONCAT(sms_id ORDER BY occurred_at DESC, sms_id DESC SEPARATOR ','),
                    ',',
                    3
                ) AS sample_sms_ids
            FROM financial_events
            WHERE kind = 'expense'
            GROUP BY COALESCE(NULLIF(TRIM(merchant), ''), 'Unknown')
            `
        );

        return rows.map((row) => ({
            merchant: String(row.merchant ?? "Unknown"),
            txCount: Number(row.tx_count ?? 0),
            pushedCount: Number(row.pushed_count ?? 0),
            sampleSmsIds: parseSmsIdList(row.sample_sms_ids),
            totalAmount: Number(row.total_amount ?? 0),
            lastSeenAt: new Date(row.last_seen),
        }));
    }

    /**
     * Expense rows with no stored merchant (for read-time SMS parse).
     *
     * @returns Newest-first expenses whose `merchant` is blank
     */
    async listExpensesMissingMerchant(): Promise<
        Array<{
            smsId: number;
            amount: number;
            occurredAt: Date;
            pushed: boolean;
            body: string;
        }>
    > {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                fe.sms_id,
                fe.amount,
                fe.occurred_at,
                fe.firefly_transaction_id,
                s.body
            FROM financial_events fe
            INNER JOIN sms_messages s ON s.id = fe.sms_id
            WHERE fe.kind = 'expense'
              AND (fe.merchant IS NULL OR TRIM(fe.merchant) = '')
            ORDER BY fe.occurred_at DESC, fe.sms_id DESC
            `
        );

        return rows.map((row) => ({
            smsId: Number(row.sms_id),
            amount: Number(row.amount ?? 0),
            occurredAt: new Date(row.occurred_at),
            pushed: Boolean(asOptionalString(row.firefly_transaction_id)),
            body: String(row.body ?? ""),
        }));
    }

    /**
     * Expense rows already posted to Dhan.
     *
     * @returns Pushed `expense` events, newest first
     */
    async listPushedExpenses(): Promise<Array<FinancialEvent & { body: string }>> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                fe.sms_id,
                fe.kind,
                fe.cash_flow,
                fe.amount,
                fe.currency,
                fe.account_last4,
                fe.counterparty_last4,
                fe.account_name,
                fe.bank,
                fe.merchant,
                fe.transaction_type,
                fe.occurred_at,
                fe.classifier,
                fe.classifier_version,
                fe.firefly_transaction_id,
                fe.firefly_pushed_at,
                s.body
            FROM financial_events fe
            LEFT JOIN sms_messages s ON s.id = fe.sms_id
            WHERE fe.kind = 'expense'
              AND fe.firefly_transaction_id IS NOT NULL
            ORDER BY fe.occurred_at DESC, fe.sms_id DESC
            `
        );

        return rows.map((row) => ({
            ...rowToEvent(row),
            body: String(row.body ?? ""),
        }));
    }
}

/** Pagination and filters for GET /knowledge. */
export interface ListFinancialEventsOptions {
    page: number;
    limit: number;
    kind?: string;
    last4?: string;
    bank?: string;
    pushed?: boolean;
    from?: Date;
    to?: Date;
}

function financialEventWhere(options: ListFinancialEventsOptions): {
    whereSql: string;
    params: unknown[];
} {
    const where: string[] = [];
    const params: unknown[] = [];

    if (options.kind) {
        where.push("kind = ?");
        params.push(options.kind);
    }

    if (options.last4) {
        where.push("(account_last4 = ? OR counterparty_last4 = ?)");
        params.push(options.last4, options.last4);
    }

    if (options.bank) {
        where.push("bank = ?");
        params.push(options.bank);
    }

    if (options.pushed === true) {
        where.push("firefly_transaction_id IS NOT NULL");
    } else if (options.pushed === false) {
        where.push("firefly_transaction_id IS NULL");
    }

    if (options.from) {
        where.push("occurred_at >= ?");
        params.push(options.from);
    }

    if (options.to) {
        where.push("occurred_at <= ?");
        params.push(options.to);
    }

    return {
        whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
        params,
    };
}

function rowToEvent(row: RowDataPacket): FinancialEvent {
    return {
        smsId: Number(row.sms_id),
        kind: String(row.kind),
        cashFlow: String(row.cash_flow),
        amount: Number(row.amount),
        currency: String(row.currency),
        accountLast4: asOptionalString(row.account_last4),
        counterpartyLast4: asOptionalString(row.counterparty_last4),
        accountName: asOptionalString(row.account_name),
        bank: asOptionalString(row.bank),
        merchant: asOptionalString(row.merchant),
        transactionType: asOptionalString(row.transaction_type),
        occurredAt: new Date(row.occurred_at),
        classifier: String(row.classifier),
        classifierVersion: String(row.classifier_version),
        fireflyTransactionId: asOptionalString(row.firefly_transaction_id),
        fireflyPushedAt: row.firefly_pushed_at ? new Date(row.firefly_pushed_at) : undefined,
    };
}

function parseSmsIdList(value: unknown): number[] {
    if (value == null) {
        return [];
    }

    return String(value)
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isFinite(id) && id > 0);
}

function asOptionalString(value: unknown): string | undefined {
    if (value == null) {
        return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
