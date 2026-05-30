import { ServicesConfig } from "../config/loadServices.config";
import { runScheduledChecks } from "./runScheduledChecks";

export function startScheduler(config: ServicesConfig) {
    const intervalSeconds = config.defaults.intervalSeconds ?? 60;
    const intervalMs = intervalSeconds * 1000;

    console.log(`🌀 Narada scheduler started. Interval: ${intervalSeconds}s`);

    let isRunning = false;


    const run = async () => {
        if (isRunning) {
            console.warn("🟡 Previous Narada check still running, skipping this cycle");
            return;
        }

        isRunning = true;

        try {
            await runScheduledChecks(config);
        } catch (error) {
            console.error("🔴 Narada check failed", error);
        } finally {
            isRunning = false;
        }
    };

    run();
    setInterval(run, intervalMs);
}