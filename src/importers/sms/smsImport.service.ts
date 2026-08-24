import { stat } from "node:fs/promises";
import { SmsImportResult } from "./sms.model";
import { isCompletedUnchangedBackup } from "./smsImport.model";
import { SmsRepository } from "./sms.repository";
import { SmsImportRepository } from "./smsImport.repository";
import { loadSmsXml, peekSmsXmlHeader } from "./smsXmlParser";

/**
 * Imports SMS Backup XML into sms_messages and records sms_imports.
 */
export class SmsImportService {
    constructor(
        private readonly repository = new SmsRepository(),
        private readonly imports = new SmsImportRepository()
    ) {}

    /**
     * Parses and persists new messages from an XML backup.
     * Skips parse only when a completed import matches file size **and**
     * SMS Backup `count` / `backup_date`. Size-only skip misses a rolling
     * backup window (new days at nearly the same byte size, frozen mtime).
     *
     * @param filePath - Absolute path to the SMS Backup XML
     */
    async import(filePath: string): Promise<SmsImportResult> {
        const startedMs = Date.now();
        const startedAt = new Date();
        let fileMtime = 0;
        let fileSize = 0;
        let xmlCount: number | undefined;
        let xmlBackupDate: number | undefined;

        try {
            const fileStat = await stat(filePath);
            fileMtime = fileStat.mtime.getTime();
            fileSize = fileStat.size;
            const header = await peekSmsXmlHeader(filePath);
            xmlCount = header.xmlCount;
            xmlBackupDate = header.xmlBackupDate;

            const existing = await this.imports.findByFileMtime(filePath, fileMtime);
            if (
                isCompletedUnchangedBackup(existing, {
                    fileSize,
                    xmlCount,
                    xmlBackupDate,
                })
            ) {
                console.info(
                    `⏭️ Unchanged ${filePath} (${fileSize} bytes, xml count=${xmlCount ?? "?"}), skip parse`
                );
                return {
                    imported: 0,
                    attempted: 0,
                    skipped: 0,
                    sourceFile: filePath,
                    durationMs: Date.now() - startedMs,
                };
            }
            if (existing?.status === "completed") {
                console.info(
                    `📥 Re-parse ${filePath} (size ${existing.fileSize ?? "unknown"} → ${fileSize}, xml ${existing.xmlCount ?? "?"} → ${xmlCount ?? "?"}, backup_date ${existing.xmlBackupDate ?? "?"} → ${xmlBackupDate ?? "?"})`
                );
            }

            const parsedBackup = await loadSmsXml(filePath);
            const attempted = parsedBackup.messages.length;
            const hashes = parsedBackup.messages.map((sms) => sms.hash);
            const existingHashes = await this.repository.findExistingHashes(hashes);
            const newMessages = parsedBackup.messages.filter(
                (sms) => !existingHashes.has(sms.hash)
            );
            const imported = await this.repository.insertMany(newMessages);

            await this.imports.save({
                sourceFile: filePath,
                fileMtime,
                fileSize,
                xmlCount,
                xmlBackupDate,
                attempted,
                imported,
                skipped: existingHashes.size,
                failed: 0,
                status: "completed",
                startedAt,
            });

            const newest = newestReceivedAt(newMessages) ?? newestReceivedAt(parsedBackup.messages);
            console.info(
                `📥 Imported ${imported}/${attempted} SMS (${existingHashes.size} skipped)${newest ? `; newest ${newest.toISOString()}` : ""}`
            );

            return {
                imported,
                attempted,
                skipped: existingHashes.size,
                failed: 0,
                sourceFile: filePath,
                durationMs: Date.now() - startedMs,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            try {
                await this.imports.save({
                    sourceFile: filePath,
                    fileMtime,
                    fileSize,
                    xmlCount,
                    xmlBackupDate,
                    attempted: 0,
                    imported: 0,
                    skipped: 0,
                    failed: 1,
                    status: "failed",
                    errorMessage,
                    startedAt,
                });
            } catch (persistError) {
                console.error("Failed to record sms_imports row", persistError);
            }

            throw error;
        }
    }
}

function newestReceivedAt(messages: { receivedAt: Date }[]): Date | undefined {
    let newest: Date | undefined;

    for (const message of messages) {
        if (!newest || message.receivedAt > newest) {
            newest = message.receivedAt;
        }
    }

    return newest;
}
