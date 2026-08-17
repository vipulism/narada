/** Outcome stored in `sms_imports`. */
export type SmsImportStatus = "completed" | "failed";

/** One XML import attempt persisted for GET /imports. */
export interface SmsImportRecord {
    id: number;
    sourceFile: string;
    fileMtime: number;
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
