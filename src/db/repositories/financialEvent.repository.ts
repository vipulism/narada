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

        await db.query("DELETE FROM financial_events");

        const batchSize = 100;

        for (let offset = 0; offset < events.length; offset += batchSize) {
            const batch = events.slice(offset, offset + batchSize);
            const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
            const values = batch.flatMap((event) => [
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
            ]);

            await db.query<ResultSetHeader>(
                `
                INSERT INTO financial_events (
                    sms_id, kind, cash_flow, amount, currency,
                    account_last4, counterparty_last4, account_name, bank, merchant,
                    transaction_type, occurred_at, classifier, classifier_version
                )
                VALUES ${placeholders}
                `,
                values
            );
        }
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
                classifier_version
            FROM financial_events
            ORDER BY occurred_at ASC, sms_id ASC
            `
        );

        return rows.map(rowToEvent);
    }
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
    };
}

function asOptionalString(value: unknown): string | undefined {
    if (value == null) {
        return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
