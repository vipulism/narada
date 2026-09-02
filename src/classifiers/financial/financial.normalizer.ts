import { RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { FinancialClassifier } from "./financial.classifier";
import { AnalysisEventSource, toFinancialEvent } from "./financial.event";
import { EventFilterSource, filterPostedEvents } from "./financial.eventFilter";
import { stampDhanAccount } from "./financial.dhanMap";
import { dueIdentityFromAnalysis, keepLatestDueReminders } from "./financial.due";
import { loadKnownAccountIndex } from "./knownAccounts";
import { FinancialEventRepository } from "../../db/repositories/financialEvent.repository";

/**
 * Builds financial_events from the latest regex-financial analysis rows.
 */
export class FinancialEventNormalizer {
    private readonly repository = new FinancialEventRepository();
    private readonly classifier = new FinancialClassifier();

    /**
     * Rebuilds financial_events from sms_analysis for the current classifier version.
     *
     * @returns How many posted events were stored
     */
    async rebuildFromAnalysis(): Promise<{ stored: number; considered: number }> {
        const sources = await this.loadAnalysisRows();
        const accounts = loadKnownAccountIndex();
        const owned: EventFilterSource[] = [];
        const dues = keepLatestDueReminders(
            sources.flatMap((source) => {
                const identity = dueIdentityFromAnalysis(source);
                return identity ? [identity] : [];
            })
        );

        for (const source of sources) {
            const event = toFinancialEvent(source);

            if (!event) {
                continue;
            }

            const stamped = stampDhanAccount(event, accounts, source.body, dues);

            if (stamped.resolution.bucket !== "unmapped") {
                owned.push({ event: stamped.event, body: source.body });
            }
        }

        const events = filterPostedEvents(owned);
        await this.repository.replaceAll(events);

        return { stored: events.length, considered: sources.length };
    }

    private async loadAnalysisRows(): Promise<AnalysisEventSource[]> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT
                s.id AS sms_id,
                s.received_at,
                s.body,
                a.category,
                a.subcategory,
                a.classifier,
                a.classifier_version,
                a.extracted_data
            FROM sms_analysis a
            JOIN sms_messages s ON s.id = a.sms_id
            WHERE a.classifier = ?
              AND a.classifier_version = ?
            `,
            [this.classifier.name, this.classifier.version]
        );

        return rows.map((row) => ({
            smsId: Number(row.sms_id),
            occurredAt: new Date(row.received_at),
            body: String(row.body ?? ""),
            category: String(row.category),
            subcategory: row.subcategory == null ? null : String(row.subcategory),
            classifier: String(row.classifier),
            classifierVersion: String(row.classifier_version),
            extractedData: parseExtractedData(row.extracted_data),
        }));
    }
}

function parseExtractedData(value: unknown): Record<string, unknown> {
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
            return {};
        }
    }

    return {};
}
