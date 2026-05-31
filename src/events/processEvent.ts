import { ServicesConfig } from "../config/loadServices.config";
import { notifyEvent } from "../notifiers/notifier.router";
import { updateServiceState } from "../state/service.state";
import { NaradaEvent } from "./naradaEvent";

export async function processEvent(event:NaradaEvent, config:ServicesConfig){

    const state = updateServiceState(event);

    if (!state.trackable) {
        console.log("⚪ Event is not service-trackable", {
          eventId: event.id,
          type: event.type,
        });
        return;
      }
  
      if (!state.changed) {
        console.log("🟢 No state change", {
          service: event.service?.name,
          state: event.type,
        });
        return;
      }
  
      console.log("📣 State changed", {
        service: event.service?.name,
        from: state.previousState,
        to: state.currentState,
      });
  
      await notifyEvent(event, config);
}
