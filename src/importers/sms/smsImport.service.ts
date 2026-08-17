import { stat } from "node:fs/promises";
import { SmsImportResult } from "./sms.model";
import { SmsRepository } from "./sms.repository";
import { SmsImportRepository } from "./smsImport.repository";
import { loadSmsXml } from "./smsXmlParser";

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
     * Skips parse when a completed import already exists for this file mtime.
     *
     * @param filePath - Absolute path to the SMS Backup XML
     */
    async import(filePath: string): Promise<SmsImportResult> {
        const startedMs = Date.now();
        const startedAt = new Date();
        let fileMtime = 0;

        try {
            const fileStat = await stat(filePath);
            fileMtime = fileStat.mtime.getTime();

            const existing = await this.imports.findByFileMtime(filePath, fileMtime);
            if (existing?.status === "completed") {
                console.info(`⏭️ Unchanged ${filePath}, skip parse`);
                return {
                    imported: 0,
                    attempted: 0,
                    skipped: 0,
                    sourceFile: filePath,
                    durationMs: Date.now() - startedMs,
                };
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
                attempted,
                imported,
                skipped: existingHashes.size,
                failed: 0,
                status: "completed",
                startedAt,
            });

            console.info(
                `📥 Imported ${imported}/${attempted} SMS (${existingHashes.size} skipped)`
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
