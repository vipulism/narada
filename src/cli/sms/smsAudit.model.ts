export interface SmsAuditReport {
    dataset: DatasetSummary;
    dateRange: DateRangeSummary;
    smsTypes: SmsTypeSummary[];
    topSenders: SenderSummary[];
}

export interface DatasetSummary {
    totalSms: number;
    uniqueSenders: number;
}

export interface DateRangeSummary {
    firstSms: Date;
    lastSms: Date;
}

export interface SmsTypeSummary {
    smsType: number;
    total: number;
}

export interface SenderSummary {
    address: string;
    total: number;
}