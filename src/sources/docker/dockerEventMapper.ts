import { NaradaEvent, NaradaEventType } from "../../events/naradaEvent"
import crypto from "node:crypto";


interface DockerEventActor {
    Attributes:{
        name:string
    }
}

type ActionType = "start" | "stop" | "die" | "kill" | "restart";

interface DockerEvent {
    "Type": string,
    "Action": ActionType,
    "Actor": DockerEventActor
  }


  const actionMap = (action: ActionType): NaradaEventType | null => {
    switch (action) {
      case "start": return "CONTAINER_STARTED";
      case "stop":
      case "die": return "CONTAINER_STOPPED";
      case "restart": return "CONTAINER_RESTARTED";
      case "kill": return "CONTAINER_KILLED";
      default: return null;
    }
  };

export const mapDockerEventToNaradaEvent  = (dockerEvent:DockerEvent):NaradaEvent | null => {

    const type = actionMap(dockerEvent.Action);
    if (!type) {
        return null;
      }
    const isCritical = (currentState:ActionType) => ['die', "kill", "stop"].some(state => state === currentState)
    return {
        id:crypto.randomUUID(),
        source: "docker",
        type,
        severity: "warning",
        message: `Container ${dockerEvent.Actor.Attributes.name} is ${dockerEvent.Action}`,
        service: {
          id: `${dockerEvent.Actor.Attributes.name}`,
          name: `${dockerEvent.Actor.Attributes.name}`,
          critical: isCritical(dockerEvent.Action)
        },
        timestamp:new Date()
    };
}