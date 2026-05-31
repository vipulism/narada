import dotenv from "dotenv";
import { startScheduler } from "./schedulers/startScheduler";
import { loadServiceConfig } from "./config/loadServices.config";
import { TelegramNotifier } from "./notifiers/telegram.notifier";
import { initNotifiers } from "./notifiers/notifier.registry";
import { startServer } from "./server/startServer";
import { connectRmq } from "./queue/rabbitConnection";

dotenv.config();
const config = loadServiceConfig();

console.log("📡 Narada is observing the Ksheer Sagar");

const notifiers = [TelegramNotifier];
connectRmq();
initNotifiers(notifiers);
startScheduler(config);
startServer(config);