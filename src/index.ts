import dotenv from "dotenv";
import { startScheduler } from "./schedulers/startScheduler";
import { loadServiceConfig } from "./config/loadServices.config";
import { TelegramNotifier } from "./notifiers/telegram.notifier";
import { initNotifiers } from "./notifiers/notifier.registry";
import { startServer } from "./server/startServer";
import { connectRmq } from "./queue/rabbitConnection";
import { setupRabbitTopology } from "./queue/rabbitTopology";
import { eventConsumer } from "./queue/eventConsumer";


async function bootstrap() {
    dotenv.config();
  
    const config = loadServiceConfig();
  
    console.log("📡 Narada is observing the Ksheer Sagar");
  
    await connectRmq();
    await setupRabbitTopology();
    await eventConsumer(config)

    initNotifiers([TelegramNotifier]);
    startScheduler(config);
    startServer(config);
  }
  
  bootstrap().catch((error) => {
    console.error("🔴 Narada failed to start", error);
    process.exit(1);
  });
