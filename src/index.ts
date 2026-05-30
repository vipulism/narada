import dotenv from "dotenv";
import { startScheduler } from "./schedulers/startScheduler";
import { loadServiceConfig } from "./config/loadServices.config";
import { TelegramNotifier } from "./notifiers/telegram.notifier";
import { initNotifiers } from "./notifiers/notifier.registry";

dotenv.config();
const config = loadServiceConfig();

console.log("📡 Narada is observing the Ksheer Sagar");

const notifires = [TelegramNotifier];
initNotifiers(notifires);
startScheduler(config);