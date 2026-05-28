import dotenv from "dotenv";
import { startPowerCastScheduler } from "./schedulers/powercast.scheduler";

dotenv.config();

console.log("📡 Narada is observing the Ksheer Sagar");

startPowerCastScheduler();