import { createHash } from "crypto";
import { PartialHashSms, SmsMessage } from "./sms.model";

/**
 * Generates a deterministic SHA-256 hash for an SMS.
 *
 * This hash is used for duplicate detection across imports.
 */
export function smsHash(message: PartialHashSms): string {
  const payload = [
    normalize(message.address),
    normalize(message.body),
    message.receivedAt.toISOString(),
    message.smsType.toString(),
  ].join("|");

  return createHash("sha256")
    .update(payload, "utf8")
    .digest("hex");
}

function normalize(value: string): string {
  return value
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ");
}