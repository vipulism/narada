import { runHttpChecks } from "../checks/httpCheck";
import { ServicesConfig } from "../config/loadServices.config";
import {  processEvent } from "../events/processEvent";

export async function runScheduledChecks(config: ServicesConfig) {
  console.log("🔄 Running Narada checks");

  const events = await runHttpChecks(config);

  for (const event of events) {
      await processEvent(event, config);
  }
}