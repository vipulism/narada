import { NaradaEvent, NaradaEventType } from "../events/naradaEvent";

type ServiceStateUpdateResult = {
  trackable: boolean;
  changed: boolean;
  serviceId?: string;
  previousState?: NaradaEventType;
  currentState?: NaradaEventType;
};

const serviceStates = new Map<string, NaradaEventType>();

export function updateServiceState(
  event: NaradaEvent
): ServiceStateUpdateResult {
  if (!event.service) {
    return {
      trackable: false,
      changed: false,
    };
  }

  const serviceId = event.service.id;
  const previousState = serviceStates.get(serviceId);
  const currentState = event.type;

  const changed =
    previousState !== undefined && previousState !== currentState;

  serviceStates.set(serviceId, currentState);

  return {
    trackable: true,
    changed,
    serviceId,
    previousState,
    currentState,
  };
}