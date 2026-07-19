import { FinancialClassifier } from "../classifiers/financial/financial.classifier";
import { ServicesConfig } from "../config/loadServices.config";
import { SmsMessage } from "../importers/sms/sms.model";
import { notifyEvent } from "../notifiers/notifier.router";
import { updateServiceState } from "../state/service.state";
import { NaradaEvent } from "./naradaEvent";

export async function processEvent(event:NaradaEvent, config:ServicesConfig){

    const state = updateServiceState(event);

        const smsMessage: SmsMessage = {
        address: event.metadata?.endpoint || "",
        body: event.message,
        contactName: event.metadata?.contactName,
        smsType: event.metadata?.smsType || 0,
        receivedAt: event.timestamp,
        sourceFile: event.metadata?.sourceFile || "",
        rawAttributes: Record<string, unknown>;
    };

    const financialClassifier = new FinancialClassifier();
    const classification = financialClassifier.classify(smsMessage);