import crypto from "node:crypto";
import { NaradaEvent, NaradaEventMetadata, NaradaEventService, NaradaEventSource, NaradaEventType, NaradaSeverity } from "./naradaEvent";

interface WebhookRequest {
    source:NaradaEventSource;
    type:NaradaEventType;
    severity:NaradaSeverity;
    message:string;
    service?:NaradaEventService;
    metadata?:NaradaEventMetadata;
}

export function createWebhookEvent(reqData:WebhookRequest):NaradaEvent{

    return {
        ...reqData,
        id: crypto.randomUUID(),
        timestamp: new Date(),
    }

}