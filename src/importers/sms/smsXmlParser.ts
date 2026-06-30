import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { SmsBackup, SmsMessage } from "./sms.model";
import { smsHash } from "./smsHash";

export interface SmsXmlNode {
  protocol?: string;
  address?: string;
  date?: string;
  type?: string;
  subject?: string;
  body?: string;
  toa?: string;
  sc_toa?: string;
  service_center?: string;
  read?: string;
  status?: string;
  locked?: string;
  date_sent?: string;
  sub_id?: string;
  readable_date?: string;
  contact_name?: string;
}

export async function loadSmsXml(filePath: string): Promise<SmsBackup> {
  const xml = await fs.readFile(filePath, "utf8");

  // 1. Handle Empty or whitespace-only XML files safely
  if (!xml || !xml.trim()) {
    return createEmptyBackup();
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });

  const backup = parser.parse(xml);

  // 2. Handle missing or deeply empty structures (e.g., <smses /> with no children)
  if (!backup || !backup.smses) {
    return createEmptyBackup();
  }

  // Ensure backup.smses.sms is always an array (fast-xml-parser leaves it as an object if there is only 1 SMS)
  let rawSmsList = backup.smses.sms;
  if (!rawSmsList) {
    rawSmsList = [];
  } else if (!Array.isArray(rawSmsList)) {
    rawSmsList = [rawSmsList];
  }

  console.log("sms length", rawSmsList.length);
  console.log("Object.keys", Object.keys(backup.smses));

  // Helper validation logic
  const isValidDate = (dateStr?: string) => dateStr && !Number.isNaN(Date.parse(dateStr));
  const isValidTimestamp = (timestampStr?: string) => timestampStr && !Number.isNaN(Number(timestampStr));

  // 3. Filter out invalid SMS nodes dynamically (Skip instead of throwing)
  const messages: SmsMessage[] = rawSmsList
    .filter((sms: SmsXmlNode) => {
      try {
        // Validate absolute structural requirements here
        if (!sms || typeof sms !== "object") return false;
        if (!sms.address || typeof sms.address !== "string") return false;
        if (!sms.body || typeof sms.body !== "string") return false;
        if (!sms.type || Number.isNaN(Number(sms.type))) return false;
        
        // Validate date schemas
        if (!isValidTimestamp(sms.date) && !isValidDate(sms.date)) return false;

        return true; // Node is healthy and valid
      } catch (e) {
        // Fallback catch to safely skip unexpected item mutations
        return false;
      }
    })
    .map((sms: SmsXmlNode) => parseXmlNode(sms, filePath));

  // Extract count variables safely with fallback zeros
  const declaredCount = Number(backup.smses.count) || 0;
  const smsCount = messages.length; 
  const mmsCount = backup.smses.mms 
    ? (Array.isArray(backup.smses.mms) ? backup.smses.mms.length : 1) 
    : 0;

  return {
    metadata: {
      count: declaredCount,
      backupSet: backup.smses.backup_set || "",
      backupDate: backup.smses.backup_date ? new Date(Number(backup.smses.backup_date)) : new Date(),
      declaredCount: declaredCount,
      smsCount: smsCount,
      mmsCount: mmsCount,
    },
    messages,
  };
}

// Separate helper initialization to standardise clean fallbacks
function createEmptyBackup(): SmsBackup {
  return {
    metadata: {
      count: 0,
      backupSet: "",
      backupDate: new Date(),
      declaredCount: 0,
      smsCount: 0,
      mmsCount: 0,
    },
    messages: [],
  };
}

function parseXmlNode(sms: SmsXmlNode, filePath: string): SmsMessage {
  // Safe default evaluations using nullish coalescing
  const smsData: SmsMessage = {
    address: (sms.address ?? "").trim(),
    body: (sms.body ?? "").trim(),
    smsType: Number(sms.type),
    receivedAt: new Date(Number(sms.date)),
    sourceFile: filePath,
    contactName: sms.contact_name === "(Unknown)" ? undefined : sms.contact_name,
    rawAttributes: {
      protocol: sms.protocol ?? "",
      toa: sms.toa ?? "",
      sc_toa: sms.sc_toa ?? "",
      service_center: sms.service_center ?? "",
      read: sms.read ?? "",
      status: sms.status ?? "",
      locked: sms.locked ?? "",
      date_sent: sms.date_sent ?? "",
      sub_id: sms.sub_id ?? "",
    },
  };

  smsData.hash = smsHash(smsData);
  return smsData;
}