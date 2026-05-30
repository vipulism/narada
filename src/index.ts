import dotenv from "dotenv";
import { startPowerCastScheduler } from "./schedulers/service.scheduler";
import { loadServiceConfig } from "./config/loadServices.config";

dotenv.config();

console.log("📡 Narada is observing the Ksheer Sagar");

startPowerCastScheduler();