import dotenv from "dotenv";
import { startScheduler } from "./schedulers/startScheduler";
import { loadServiceConfig } from "./config/loadServices.config";
import { TelegramNotifier } from "./notifiers/telegram.notifier";
import { initNotifications } from "./notifiers/notifier.registry";

dotenv.config();
const config = loadServiceConfig();

console.log("📡 Narada is observing the Ksheer Sagar");

const notifires = [TelegramNotifier];
initNotifications(notifires);
startScheduler(config);