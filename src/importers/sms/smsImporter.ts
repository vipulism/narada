import { loadSmsXml } from './smsXmlParser';
import { SmsRepository } from './sms.repository';
import { ImportStatistics } from './importStats';

export class SmsImporter {
  private smsRepository: SmsRepository;
  private importStatistics: ImportStatistics;

  constructor() {
    this.smsRepository = new SmsRepository();
    this.importStatistics = new ImportStatistics();
  }

  async importXmlFile(filePath: string): Promise<void> {
    try {
      const smsBackup = await loadSmsXml(filePath);
      await this.smsRepository.insertMany(smsBackup.messages);
      this.importStatistics.incrementTotalMessages(smsBackup.messages.length);
    } catch (error) {
      console.error(`Failed to import SMS file: ${filePath}`, error);
      this.importStatistics.incrementFailedMessages(1);
    }
  }
} 