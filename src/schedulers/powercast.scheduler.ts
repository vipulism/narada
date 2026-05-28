import cron from "node-cron";
import { checkPowerCast } from "../checks/powercast.check";
import { isPowerCastHealthy } from "../state/powercast.state";
import { sendTelegramMessage } from "../notifiers/telegram";

export function startPowerCastScheduler(): void {
    cron.schedule("*/1 * * * *", async () => {
        console.log("📡 Narada observes the Ksheer Sagar");

        try {
            await checkPowerCast();

            if (!isPowerCastHealthy) {
                await sendTelegramMessage("🟢 Amrit restored\nPowerCast recovered");
            }
        } catch (error) {
            if (isPowerCastHealthy) {
                await sendTelegramMessage("🔴 Halahal detected\nPowerCast unreachable")
            }
        }
    });
}