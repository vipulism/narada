import { ServicesConfig } from "../config/loadServices.config";
import { runScheduledChecks } from "./service.scheduler";

export function startScheduler(config: ServicesConfig) {
  const intervalSeconds = config.defaults.intervalSeconds ?? 60;
  const intervalMs = intervalSeconds * 1000;

  console.log(`🌀 Narada scheduler started: every ${intervalSeconds}s`);

  runScheduledChecks(config);

  setInterval(() => {
    runScheduledChecks(config);
  }, intervalMs);
}