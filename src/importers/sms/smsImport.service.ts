import { SmsImportResult } from "./sms.model";
import { SmsRepository } from "./sms.repository";
import { loadSmsXml } from "./smsXmlParser";



export class SmsImportService {

    constructor(
        private readonly repository = new SmsRepository()
      ) {}


      async import(filePath: string): Promise<SmsImportResult>{

        const started = Date.now();
        const parsedBackup =  await loadSmsXml(filePath);
        const attempted = parsedBackup.messages.length;
        const hashes = parsedBackup.messages.map(sms => sms.hash);
        const existingHashes = await this.repository.findExistingHashes(hashes);
        const newMessages  = parsedBackup.messages.filter(sms => !existingHashes.has(sms.hash));

        const imported = await this.repository.insertMany(newMessages );

        console.info(
            `📥 Imported ${imported}/${attempted} SMS (${existingHashes.size} skipped)`
          );

        return {

            imported,
            attempted,
            skipped:existingHashes.size,
            sourceFile:filePath,
            durationMs: Date.now() - started

        }

      }
}