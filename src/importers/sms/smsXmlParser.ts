import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { PartialHashSms, SmsBackup, SmsMessage } from "./sms.model";
import { smsHash } from "./smsHash";

/** Root attributes from the first bytes of an SMS Backup XML. */
export interface SmsXmlHeader {
    xmlCount?: number;
    xmlBackupDate?: number;
}

const HEADER_BYTES = 8192;

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

/**
 * Reads `count` and `backup_date` from `<smses>` without parsing every message.
 *
 * @param filePath - Absolute path to the SMS Backup XML
 */
export async function peekSmsXmlHeader(filePath: string): Promise<SmsXmlHeader> {
    const handle = await fs.open(filePath, "r");

    try {
        const buf = Buffer.alloc(HEADER_BYTES);
        const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0);

        return parseSmsXmlHeader(decodeXmlHead(buf.subarray(0, bytesRead)));
    } finally {
        await handle.close();
    }
}

/**
 * Parses SMS Backup `<smses count backup_date>` from a file prefix.
 *
 * @param head - First kilobytes of the XML (UTF-8 or UTF-16 decoded)
 */
export function parseSmsXmlHeader(head: string): SmsXmlHeader {
    const smses = head.match(/<smses\b[^>]*>/i)?.[0];

    if (!smses) {
        return {};
    }

    const count = smses.match(/\bcount=["'](\d+)["']/i);
    const backupDate = smses.match(/\bbackup_date=["'](\d+)["']/i);
    const header: SmsXmlHeader = {};

    if (count) {
        header.xmlCount = Number(count[1]);
    }

    if (backupDate) {
        header.xmlBackupDate = Number(backupDate[1]);
    }

    return header;
}

/**
 * Parses SMS Backup & Restore XML into domain messages.
 *
 * @param filePath - Absolute path to the SMS Backup XML
 */
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
        if (!sms || typeof sms !== "object") return false;

        const address = asAttr(sms.address);
        const body = asAttr(sms.body);
        const type = asAttr(sms.type);
        const date = asAttr(sms.date);

        if (!address || !body || !type || Number.isNaN(Number(type))) return false;
        if (!isValidTimestamp(date) && !isValidDate(date)) return false;

        return true;
      } catch (e) {
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

function decodeXmlHead(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }

  return buf.toString("utf8");
}

function asAttr(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function parseXmlNode(sms: SmsXmlNode, filePath: string): SmsMessage {
  const date = asAttr(sms.date);
  const receivedAt = isFiniteTimestamp(date) ? new Date(Number(date)) : new Date(date);
  const contactName = asAttr(sms.contact_name);
  const smsData: PartialHashSms = {
    address: asAttr(sms.address),
    body: asAttr(sms.body),
    smsType: Number(asAttr(sms.type)),
    receivedAt,
    sourceFile: filePath,
    contactName: !contactName || contactName === "(Unknown)" ? undefined : contactName,
    rawAttributes: {
      protocol: asAttr(sms.protocol),
      toa: asAttr(sms.toa),
      sc_toa: asAttr(sms.sc_toa),
      service_center: asAttr(sms.service_center),
      read: asAttr(sms.read),
      status: asAttr(sms.status),
      locked: asAttr(sms.locked),
      date_sent: asAttr(sms.date_sent),
      sub_id: asAttr(sms.sub_id),
    },
  };

  smsData.hash = smsHash(smsData);
  return smsData as SmsMessage;
}

function isFiniteTimestamp(value: string): boolean {
  if (!value) {
    return false;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && !Number.isNaN(numeric);
}