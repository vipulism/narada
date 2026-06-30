import { loadSmsXml } from "./smsXmlParser";

async function main() {
  const backup = await loadSmsXml(
    "./test-data/sms-20260623200509.xml"
  );

  console.log(backup.metadata);

  console.log(backup.messages.length);

  console.log(backup.messages[0]);
}

main().catch(console.error);