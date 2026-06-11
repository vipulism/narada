import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { saveNotificationResult } from "../repositories/notification.repository";
import { getNotifier } from "./notifier.registry";

export async function notifyEvent(event: NaradaEvent, config: ServicesConfig) {


  const servicesConfig = config.services.find(service => service.id === event.service?.id);
  const notifierList = servicesConfig?.notifiers ?? config.defaults.notifiers ?? ["telegram"];


  if (notifierList.length === 0) {
    console.log("🔕 Notifications muted", {
      service: event.service?.name,
      event: event.type,
    });
    return;
  }

  for (const notifierName of notifierList) {
    const notifier = getNotifier(notifierName)

    if (!notifier) {
      console.warn("⚠️ Unknown notifier skipped", { notifierId: notifierName });
    } else {

      try {
        await notifier.send(event);

      } catch (error) {
        await saveNotificationResult({
          eventId: event.id,
          notifierType: notifierName,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });

        console.error("❌ Notification failed", {
          notifier: notifierName,
          eventId: event.id,
          error,
        });

        continue;
      }

      await saveNotificationResult({
        eventId: event.id,
        notifierType: notifierName,
        status: "sent",
      });
    }
  }
}
