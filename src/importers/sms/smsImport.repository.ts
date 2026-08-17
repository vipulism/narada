import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDb } from "../../db/mariaConnection";
import {
    ListSmsImportsOptions,
    SmsImportRecord,
    SmsImportStatus,
    SmsImportWrite,
} from "./smsImport.model";

/**
 * Reads and writes `sms_imports` rows for audit and GET /imports.
 */
export class SmsImportRepository {
    /**
     * Returns the import recorded for this file and mtime, if any.
     *
     * @param sourceFile - Absolute XML path
     * @param fileMtime - File mtime in milliseconds
     */
    async findByFileMtime(
        sourceFile: string,
        fileMtime: number
    ): Promise<SmsImportRecord | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT *
            FROM sms_imports
            WHERE source_file = ?
              AND file_mtime = ?
            LIMIT 1
            `,
            [sourceFile, fileMtime]
        );

        return rows[0] ? rowToImport(rows[0]) : null;
    }

    /**
     * Inserts a new run, or updates the existing (file, mtime) row (failed retries).
     *
     * @param record - Counts and status from this import attempt
     */
    async save(record: SmsImportWrite): Promise<void> {
        const db = getDb();
        const existing = await this.findByFileMtime(record.sourceFile, record.fileMtime);

        if (existing) {
            await db.query(
                `
                UPDATE sms_imports
                SET attempted = ?,
                    imported = ?,
                    skipped = ?,
                    failed = ?,
                    status = ?,
                    error_message = ?,
                    started_at = ?,
                    completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [
                    record.attempted,
                    record.imported,
                    record.skipped,
                    record.failed,
                    record.status,
                    record.errorMessage ?? null,
                    record.startedAt,
                    existing.id,
                ]
            );
            return;
        }

        await db.query<ResultSetHeader>(
            `
            INSERT INTO sms_imports (
                source_file,
                file_mtime,
                attempted,
                imported,
                skipped,
                failed,
                status,
                error_message,
                started_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                record.sourceFile,
                record.fileMtime,
                record.attempted,
                record.imported,
                record.skipped,
                record.failed,
                record.status,
                record.errorMessage ?? null,
                record.startedAt,
            ]
        );
    }

    /**
     * Lists import runs, newest first.
     *
     * @param options - Page, limit, optional status filter
     */
    async list(
        options: ListSmsImportsOptions
    ): Promise<{ items: SmsImportRecord[]; total: number }> {
        const db = getDb();
        const offset = (options.page - 1) * options.limit;
        const where: string[] = [];
        const params: unknown[] = [];

        if (options.status) {
            where.push("status = ?");
            params.push(options.status);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT *
            FROM sms_imports
            ${whereSql}
            ORDER BY completed_at DESC, id DESC
            LIMIT ? OFFSET ?
            `,
            [...params, options.limit, offset]
        );

        const [countRows] = await db.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS total
            FROM sms_imports
            ${whereSql}
            `,
            params
        );

        return {
            items: rows.map(rowToImport),
            total: Number(countRows[0]?.total ?? 0),
        };
    }

    /**
     * Loads one import run by primary key.
     *
     * @param id - `sms_imports.id`
     */
    async getById(id: number): Promise<SmsImportRecord | null> {
        const db = getDb();
        const [rows] = await db.query<RowDataPacket[]>(
            `
            SELECT *
            FROM sms_imports
            WHERE id = ?
            LIMIT 1
            `,
            [id]
        );

        return rows[0] ? rowToImport(rows[0]) : null;
    }
}

function rowToImport(row: RowDataPacket): SmsImportRecord {
    const errorMessage = asOptionalString(row.error_message);

    return {
        id: Number(row.id),
        sourceFile: String(row.source_file),
        fileMtime: Number(row.file_mtime),
        attempted: Number(row.attempted),
        imported: Number(row.imported),
        skipped: Number(row.skipped),
        failed: Number(row.failed),
        status: row.status as SmsImportStatus,
        ...(errorMessage ? { errorMessage } : {}),
        startedAt: new Date(row.started_at),
        completedAt: new Date(row.completed_at),
    };
}

function asOptionalString(value: unknown): string | undefined {
    if (value == null) {
        return undefined;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
