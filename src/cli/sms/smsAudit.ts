import { RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import { DatasetSummary, DateRangeSummary, SenderSummary, SmsAuditReport, SmsTypeSummary } from "./smsAudit.model";

interface CountRow extends RowDataPacket {
    total: number;
}

interface DateRangeRow extends RowDataPacket {
    firstSms: Date;
    lastSms: Date;
}

interface SenderRow extends RowDataPacket {
    address: string;
    total: number;
}

interface SmsTypeRow extends RowDataPacket {
    sms_type: number;
    total: number;
}

export class SmsAudit {

    async run(): Promise<SmsAuditReport> {

      
        const dataset = await this.datasetSummary();
        const dateRange = await this.dateRangeSummary();
        const smsTypes = await this.smsTypeSummary();
        const topSenders = await this.senderSummary();

        return {
            dataset,
            dateRange,
            smsTypes,
            topSenders,
        };

    }

    private async datasetSummary(): Promise<DatasetSummary> {

        const db = getDb();

        const [[count]] = await db.query<CountRow[]>(`
            SELECT COUNT(*) AS total
            FROM sms_messages
        `);

        const [[uniqueSenders]] = await db.query<CountRow[]>(`
            SELECT COUNT(DISTINCT address) AS total
            FROM sms_messages
        `);

        return {
            totalSms:count.total,
            uniqueSenders:uniqueSenders.total
        }
    }

    private async dateRangeSummary(): Promise<DateRangeSummary> {

        const db = getDb();

        const [[row]] = await db.query<DateRangeRow[]>(`
            SELECT
                MIN(received_at) AS firstSms,
                MAX(received_at) AS lastSms
            FROM sms_messages
        `);

        
       return  {
            firstSms: row.firstSms,
            lastSms: row.lastSms
        }

    }

    private async smsTypeSummary(): Promise<SmsTypeSummary[]> {

        const db = getDb();

        const [rows] = await db.query<SmsTypeRow[]>(`
            SELECT
                sms_type,
                COUNT(*) AS total
            FROM sms_messages
            GROUP BY sms_type
            ORDER BY total DESC
        `);


        const result:SmsTypeSummary[] = [];

        for (const row of rows) {

            result.push({
                smsType:row.sms_type,
                total: row.total,
            });
        }

        return result;

    }

    private async senderSummary(): Promise<SenderSummary[]> {

        const db = getDb();

        const [rows] = await db.query<SenderRow[]>(`
            SELECT
                address,
                COUNT(*) AS total
            FROM sms_messages
            GROUP BY address
            ORDER BY total DESC
            LIMIT 20
        `);


        const result:SenderSummary[] = [];

        rows.forEach((row, index) => {


            result.push({
                address: row.address,
                total: row.total
            });

        });

        return result;
    }

    private smsTypeName(type: number): string {

        switch (type) {

            case 1:
                return "Inbox";

            case 2:
                return "Sent";

            default:
                return `Unknown (${type})`;

        }

    }

    private formatDate(date: Date): string {

        return date.toISOString().substring(0, 10);

    }

}