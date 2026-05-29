import cron from "node-cron";
import { checkPowerCast } from "../checks/runService.check";
import { getEndpointState, getPowerCastHealth, setEndpointState, setPowerCastHealth } from "../state/service.state";
import { sendTelegramMessage } from "../notifiers/telegram.notifier";
import { loadServiceConfig } from "../config/loadServices.config";
import { httpsChecker } from "../checks/httpCheck";

export function startPowerCastScheduler(): void {




    cron.schedule("*/1 * * * *", async () => {

        const serviceConfig = await loadServiceConfig()

        console.log("📡 Narada observes the Ksheer Sagar");

        const results = await httpsChecker(serviceConfig);

        try {

            for (const result of results) {
                const oldState = getEndpointState(result.endpoint);
                const newState = result.status;

                if (newState === "failed") {
                    await sendTelegramMessage(
                        `🔴 Halahal detected\n${result.endpoint} failed`
                    );
                }

                if (oldState !== newState) {
                    if (newState === "slow") {
                        await sendTelegramMessage(
                            `🟡 Manthan Warning\n${result.endpoint} is slow: ${result.responseTimeMs}ms`
                        );
                    }

                    if (newState === "healthy") {
                        await sendTelegramMessage(
                            `🟢 Amrit restored\n${result.endpoint} recovered`
                        );
                    }

                    setEndpointState(result.endpoint, newState);
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