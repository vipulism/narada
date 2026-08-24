/** Outcome stored in `sms_imports`. */
export type SmsImportStatus = "completed" | "failed";

/**
 * True when this backup snapshot was already imported and the file has not
 * grown. Same mtime + same size is a no-op; same mtime + larger size (or a
 * legacy row with no stored size) must be re-parsed.
 *
 * @param existing - Prior `sms_imports` row for this path + mtime, if any
 * @param fileSize - Current `stat.size` in bytes
 */
export function isCompletedUnchangedBackup(
    existing: Pick<SmsImportRecord, "status" | "fileSize"> | null | undefined,
    fileSize: number
): boolean {
    return (
        existing?.status === "completed" &&
        existing.fileSize != null &&
        Number(existing.fileSize) === fileSize
    );
}

/** One XML import attempt persisted for GET /imports. */
export interface SmsImportRecord {
    id: number;
    sourceFile: string;
    fileMtime: number;
    fileSize?: number | null;
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
