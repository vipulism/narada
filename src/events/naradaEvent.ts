import { ServiceDefinition } from "../config/loadServices.config";

export type NaradaEventType =
  | "SERVICE_HEALTHY"
  | "SERVICE_SLOW"
  | "SERVICE_FAILED"
  | "SERVICE_RECOVERED"
  | "CONTAINER_STOPPED"
  | "BACKUP_FAILED";

export type NaradaSeverity = "info" | "warning" | "critical";

export type NaradaEventSource =
  | "http-checker"
  | "docker-watcher"
  | "dozzle"
  | "uptime-kuma"
  | "backup-script"
  | "manual";


  export interface NaradaEvent {
    id: string;
    source: NaradaEventSource;
    type: NaradaEventType;
    severity: NaradaSeverity;
    message: string;
    timestamp: Date;
    service?: {
      id:string,
      name:string,
      critical:boolean
    };
    metadata: {
      endpoint: string,
      responseTimeMs?: number,
      statusCode?: number,
      thresholdMs?: number,
      error?:any,
    };
  }

