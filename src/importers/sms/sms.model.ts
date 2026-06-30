// export interface SmsMessage {
//     id?: number;
//     smsId?: number;
//     address: string;
//     contactName?: string;
//     body: string;
//     smsType: number;
//     receivedAt: Date;
//     sourceFile?: string;
//     hash?: string;
//     rawAttributes:any;
//   }

export interface SmsBackup {
  metadata: SmsBackupMetadata;
  messages: SmsMessage[];
}

export interface SmsBackupMetadata {
  declaredCount: number;
  smsCount: number;
  mmsCount: number;
  backupSet: string;
  backupDate: Date;
  count:number;
}

export interface SmsMessage {

  address: string;
  body: string;
  contactName?: string;
  smsType: number;
  receivedAt: Date;
  sourceFile: string;
  rawAttributes: Record<string, unknown>;
  hash:string;

}

export type PartialHashSms = Omit<SmsMessage, 'hash'> & Partial<Pick<SmsMessage, 'hash'>>;

export interface SmsImportResult {
  sourceFile: string;
  attempted: number;
  imported: number;
  skipped: number;
  durationMs: number;
}