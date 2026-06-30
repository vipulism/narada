import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { SmsBackup } from "./sms.model";

export interface SmsXmlNode {
  protocol: string;
  address: string;
  date: string;
  type: string;
  subject: string;
  body: string;
  toa: string;
  sc_toa: string;
  service_center: string;
  read: string;
  status: string;
  locked: string;
  date_sent: string;
  sub_id: string;
  readable_date: string;
  contact_name: string;
}
 

export async function loadSmsXml(
  filePath: string
): Promise<SmsBackup> {
  
  const xml = await fs.readFile(filePath, "utf8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });

  const backup = parser.parse(xml);

  console.log("sms length", backup.smses.sms.length);
  console.log("Object.keys", Object.keys(backup.smses));

  const messages = backup.smses.sms.map((sms:SmsXmlNode) => {
    return {

      address: sms.address,
      body: sms.body,
      smsType: Number(sms.type),
      receivedAt: new Date(Number(sms.date)),
      sourceFile: filePath,
      contactName:
          sms.contact_name === "(Unknown)"
              ? undefined
              : sms.contact_name,
  
      rawAttributes: {
          protocol: sms.protocol,
          toa: sms.toa,
          sc_toa: sms.sc_toa,
          service_center: sms.service_center,
          read: sms.read,
          status: sms.status,
          locked: sms.locked,
          date_sent: sms.date_sent,
          sub_id: sms.sub_id
      }
  
  }
  });

  return {

    metadata: {
        count: Number(backup.smses.count),
        backupSet: backup.smses.backup_set,
        backupDate: new Date(Number(backup.smses.backup_date)),
        declaredCount: Number(backup.smses.count),
        smsCount: Number(backup.smses.sms.length),
        mmsCount: Number(backup.smses.mms.length),
    },

    messages

}

}