import { runHttpChecks } from "../checks/httpCheck";
import { ServicesConfig } from "../config/loadServices.config";
import { notifyEvent } from "../notifiers/notifier.router";
import { updateServiceState } from "../state/service.state";

export async function runScheduledChecks(config: ServicesConfig) {
  console.log("🔄 Running Narada checks");

  const events = await runHttpChecks(config);

  for (const event of events) {
    const state = updateServiceState(event);

    if (!state.trackable) {
      console.log("⚪ Event is not service-trackable", {
        eventId: event.id,
        type: event.type,
      });
      continue;
    }

    if (!state.changed) {
      console.log("🟢 No state change", {
        service: event.service?.name,
        state: event.type,
      });
      continue;
    }

    console.log("📣 State changed", {
      service: event.service?.name,
      from: state.previousState,
      to: state.currentState,
    });

    await notifyEvent(event, config);
  }
}