import { SmsAnalysis, SmsMessage } from "../importers/sms/sms.model";

export interface SmsClassifier {

    readonly name: string;

    readonly version: string;

    supports(message: SmsMessage): number;

    classify(message: SmsMessage): SmsAnalysis | null;

}