import { NaradaEventType } from "./naradaEvent";

export const createServiceMessage = (params: {
  serviceName: string;
  type: NaradaEventType;
  responseTimeMs?: number;
  error?: string;
}) => {
  switch (params.type) {
    case "SERVICE_HEALTHY":
      return `${params.serviceName} is healthy`;

    case "SERVICE_SLOW":
      return `${params.serviceName} is slow (${params.responseTimeMs}ms)`;

    case "SERVICE_FAILED":
      return `${params.serviceName} failed: ${params.error ?? "Unknown error"}`;

    case "SERVICE_RECOVERED":
      return `${params.serviceName} recovered`;

    case "CONTAINER_STARTED":
      return `${params.serviceName} started`;

    case "CONTAINER_STOPPED":
      return `${params.serviceName} stopped`;

    case "CONTAINER_RESTARTED":
      return `${params.serviceName} restarted`;

    case "CONTAINER_KILLED":
      return `${params.serviceName} was killed`;

    case "BACKUP_FAILED":
      return `${params.serviceName} backup failed: ${params.error ?? "Unknown error"}`;

    default:
      return `${params.serviceName} status changed`;
  }
}