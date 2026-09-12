/** Outcome stored in `sms_imports`. */
export type SmsImportStatus = "completed" | "failed";

/** Filesystem + XML root attributes used to decide whether to re-parse. */
export interface SmsBackupSnapshot {
    fileSize: number;
    xmlCount?: number | null;
    xmlBackupDate?: number | null;
}

/**
 * True when this backup snapshot was already imported.
 * Size-only skip misses rolling SMS Backup windows (22–23 Aug can replace
 * 20–21 Aug at nearly the same byte size while mtime stays frozen). XML
 * `count` / `backup_date` must also match; missing stored headers re-parse once.
 * An empty peek (`<smses` past the first 8 KiB) must not skip on size alone.
 *
 * @param existing - Prior `sms_imports` row for this path + mtime, if any
 * @param snapshot - Current file size and SMS Backup root attributes
 */
export function isCompletedUnchangedBackup(
    existing:
        | Pick<SmsImportRecord, "status" | "fileSize" | "xmlCount" | "xmlBackupDate">
        | null
        | undefined,
    snapshot: SmsBackupSnapshot
): boolean {
    if (existing?.status !== "completed" || existing.fileSize == null) {
        return false;
    }

    if (Number(existing.fileSize) !== snapshot.fileSize) {
        return false;
    }

    if (snapshot.xmlCount == null && snapshot.xmlBackupDate == null) {
        return false;
    }

    if (snapshot.xmlCount != null) {
        if (existing.xmlCount == null || Number(existing.xmlCount) !== snapshot.xmlCount) {
            return false;
        }
    }

    if (snapshot.xmlBackupDate != null) {
        if (
            existing.xmlBackupDate == null ||
            Number(existing.xmlBackupDate) !== snapshot.xmlBackupDate
        ) {
            return false;
        }
    }

    return true;
}

/** Re-parse when the newest stored SMS is older than this (36h). */
export const STALE_SMS_REPARSE_AFTER_MS = 36 * 60 * 60 * 1000;

/** At most one stale re-parse in this window so a stuck backup is not parsed every 10 min. */
export const STALE_SMS_REPARSE_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * True when the SMS folder looks unchanged but Narada's newest SMS is stale.
 * Catches a skip fingerprint that missed a rolling backup, without parsing
 * a frozen file every ingest.
 *
 * @param options - Newest stored SMS and last completed import for this file
 */
export function shouldReparseStaleUnchangedBackup(options: {
    newestReceivedAt?: Date | null;
    lastCompletedAt?: Date | null;
    now?: Date;
}): boolean {
    const now = options.now ?? new Date();
    const newest = options.newestReceivedAt;

    if (!newest || Number.isNaN(newest.getTime())) {
        return true;
    }

    if (now.getTime() - newest.getTime() < STALE_SMS_REPARSE_AFTER_MS) {
        return false;
    }

    const lastCompleted = options.lastCompletedAt;

    if (!lastCompleted || Number.isNaN(lastCompleted.getTime())) {
        return true;
    }

    return now.getTime() - lastCompleted.getTime() >= STALE_SMS_REPARSE_EVERY_MS;
}

/** One XML import attempt persisted for GET /imports. */
export interface SmsImportRecord {
    id: number;
    sourceFile: string;
    fileMtime: number;
    fileSize?: number | null;
    xmlCount?: number | null;
    xmlBackupDate?: number | null;
    attempted: number;
    imported: number;
    skipped: number;
    failed: number;
    status: SmsImportStatus;
    errorMessage?: string;
    startedAt: Date;
    completedAt: Date;
}

/** Fields written after an import run. */
export interface SmsImportWrite {
    sourceFile: string;
    fileMtime: number;
    fileSize?: number | null;
    xmlCount?: number | null;
    xmlBackupDate?: number | null;
    attempted: number;
    imported: number;
    skipped: number;
    failed: number;
    status: SmsImportStatus;
    errorMessage?: string;
    startedAt: Date;
}

/** Pagination and filters for listing import runs. */
export interface ListSmsImportsOptions {
    page: number;
    limit: number;
    status?: SmsImportStatus;
}
