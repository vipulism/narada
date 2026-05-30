import cron from "node-cron";
import { getEndpointState, getPowerCastHealth, setEndpointState, setPowerCastHealth } from "../state/service.state";
import { sendTelegramMessage } from "../notifiers/telegram.notifier";
import { loadServiceConfig } from "../config/loadServices.config";
import { runHttpChecks } from "../checks/httpCheck";

export function startPowerCastScheduler(): void {

    cron.schedule("*/1 * * * *", async () => {

        const serviceConfig = await loadServiceConfig()
        console.log("📡 Narada observes the Ksheer Sagar");
        const results = await runHttpChecks(serviceConfig);

        try {

            for (const result of results) {
                const oldState = getEndpointState(result?.metadata?.endpoint as string);
                const severity = result.type;

                await sendTelegramMessage(result.message);

                if (oldState !== severity) {
                    setEndpointState(result?.metadata?.endpoint || "", severity);
                }

                if (!getPowerCastHealth()) {
                    setPowerCastHealth(true);
                    await sendTelegramMessage("🟢 Amrit restored\nPowerCast recovered");
                }
            }

        } catch (error) {
            console.error("Narada scheduler crashed", error);

        }
    });
}