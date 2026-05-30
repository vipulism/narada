import { ServiceDefinition } from "../config/loadServices.config";
import { createServiceMessage } from "../events/eventMessage";
import { NaradaEvent } from "../events/naradaEvent";
import crypto from "node:crypto";


export const  createHttpEvent = (params: {
    service: ServiceDefinition;
    type: NaradaEvent["type"];
    severity: NaradaEvent["severity"];
    responseTimeMs?: number;
    statusCode?: number;
    thresholdMs?: number;
    error?: string;
  }): NaradaEvent => {
    return {
      id: crypto.randomUUID(),
      source: "http-checker",
      type: params.type,
      severity: params.severity,
      message: createServiceMessage({
        serviceName: params.service.name,
        type: params.type,
        responseTimeMs: params.responseTimeMs,
        error: params.error,
      }),
      timestamp: new Date(),
  
      service: {
        id: params.service.id,
        name: params.service.name,
        critical: params.service.critical,
      },
  
      metadata: {
        endpoint: params.service.url,
        responseTimeMs: params.responseTimeMs,
        statusCode: params.statusCode,
        thresholdMs: params.thresholdMs,
        error: params.error,
      },
    };
  }