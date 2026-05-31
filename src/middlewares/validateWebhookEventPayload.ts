import { NextFunction, Request, Response } from "express";
import {
  NaradaEventSource,
  NaradaEventType,
  NaradaSeverity,
} from "../events/naradaEvent";

const VALID_SOURCES: readonly NaradaEventSource[] = [
  "http-checker",
  "docker-watcher",
  "dozzle",
  "uptime-kuma",
  "backup-script",
  "manual",
];

const VALID_TYPES: readonly NaradaEventType[] = [
  "SERVICE_HEALTHY",
  "SERVICE_SLOW",
  "SERVICE_FAILED",
  "SERVICE_RECOVERED",
  "CONTAINER_STOPPED",
  "BACKUP_FAILED",
];

const VALID_SEVERITIES: readonly NaradaSeverity[] = [
  "info",
  "warning",
  "critical",
];

const isValidSource = (source: unknown): source is NaradaEventSource =>
  typeof source === "string" &&
  (VALID_SOURCES as readonly string[]).includes(source);

const isValidType = (type: unknown): type is NaradaEventType =>
  typeof type === "string" &&
  (VALID_TYPES as readonly string[]).includes(type);

const isValidSeverity = (severity: unknown): severity is NaradaSeverity =>
  typeof severity === "string" &&
  (VALID_SEVERITIES as readonly string[]).includes(severity);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

 
export const validateWebhookEventPayload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { source, type, severity, message } = req.body ?? {};

  if (!isValidSource(source)) {
    res.status(400).json({ error: "Invalid or missing source" });
    return;
  }

  if (!isValidType(type)) {
    res.status(400).json({ error: "Invalid or missing type" });
    return;
  }

  if (!isValidSeverity(severity)) {
    res.status(400).json({ error: "Invalid or missing severity" });
    return;
  }

  if (!isNonEmptyString(message)) {
    res.status(400).json({ error: "Missing required field: message" });
    return;
  }

  next();
};
