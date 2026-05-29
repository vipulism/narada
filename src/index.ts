import dotenv from "dotenv";
import { startPowerCastScheduler } from "./schedulers/service.scheduler";

dotenv.config();

console.log("📡 Narada is observing the Ksheer Sagar");

startPowerCastScheduler();