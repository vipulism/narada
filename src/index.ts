import dotenv from "dotenv";
import { runScheduledChecks } from "./schedulers/runScheduledChecks";
import { startScheduler } from "./schedulers/startScheduler";
import { loadServiceConfig } from "./config/loadServices.config";

dotenv.config();

const config = loadServiceConfig();

console.log("📡 Narada is observing the Ksheer Sagar");

startScheduler(config);