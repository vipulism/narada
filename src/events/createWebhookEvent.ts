import crypto from "node:crypto";
import { NaradaEventMetadata, NaradaEventService, NaradaEventSource, NaradaEventType, NaradaSeverity } from "./naradaEvent";

interface webhookRequest {
    source:NaradaEventSource;
    type:NaradaEventType;
    severity:NaradaSeverity;
    message:string;
    service?:NaradaEventService;
    metadata?:NaradaEventMetadata;
}

export function createWebhookEvent(reqData:webhookRequest){

    const data = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
    }

    return {
        ...data,
        ...reqData
    }

}