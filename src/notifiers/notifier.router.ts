import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { getNotifier } from "./notifier.registry";

export async function notifyEvent(event:NaradaEvent, config:ServicesConfig){


    const servicesConfig = config.services.find(service => service.id === event.service?.id);
    const notifierList = servicesConfig?.notifiers ?? config.defaults.notifiers ?? ["telegram"];


    if (notifierList.length === 0) {
        console.log("🔕 Notifications muted", {
          service: event.service?.name,
          event: event.type,
        });
        return;
      }

      notifierList.forEach(async notifierName => {

        const notifier = getNotifier(notifierName)

        if (!notifier) {
            console.warn("⚠️ Unknown notifier skipped", { notifierId: notifierName });
          }else {
            await notifier.send(event)
          }

      })
    

}