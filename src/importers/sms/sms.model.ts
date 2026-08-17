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

import { FinancialEvent } from "../../classifiers/financial/financial.model";
import { ImportResult } from "../import.types";

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

export interface SmsMessageWithId extends SmsMessage {
  id: number;
}

/** SMS list row with preferred classifier analysis. */
export interface SmsListItem {
  id: number;
  address: string;
  contactName?: string;
  body: string;
  smsType: number;
  receivedAt: Date;
  sourceFile?: string;
  category?: string;
  subcategory?: string;
  confidence?: number;
}

/** SMS detail including analysis payload and optional posted event. */
export interface SmsDetail extends SmsListItem {
  hash: string;
  rawAttributes: Record<string, unknown> | null;
  extractedData?: Record<string, unknown>;
  financialEvent?: FinancialEvent;
}

/** Pagination and filters for GET /sms. */
export interface ListSmsOptions {
  page: number;
  limit: number;
  category?: string;
  subcategory?: string;
  address?: string;
  from?: Date;
  to?: Date;
  preferredClassifier: string;
  preferredVersion: string;
}

export type PartialHashSms = Omit<SmsMessage, 'hash'> & Partial<Pick<SmsMessage, 'hash'>>;

export interface SmsImportResult extends ImportResult {
  sourceFile: string;
}

export enum SmsCategory {
  UNKNOWN = "UNKNOWN",
  AUTHENTICATION = "AUTHENTICATION",
  FINANCIAL = "FINANCIAL",
  COMMERCE = "COMMERCE",
  TRAVEL = "TRAVEL",
  GOVERNMENT = "GOVERNMENT",
  UTILITY = "UTILITY",
  PERSONAL = "PERSONAL",
  PROMOTION = "PROMOTION",
  SYSTEM = "SYSTEM",
}
export type FinancialSubCategory = string;

export interface SmsAnalysis {
  category: SmsCategory;
  subcategory?: string;
  confidence: number;
  extractedData?: Record<string, unknown> | undefined;
  classifier: string;
  classifierVersion: string;
  classifiedAt: Date;
}
