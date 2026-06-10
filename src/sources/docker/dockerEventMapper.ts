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


const actionMap = (action:ActionType):NaradaEventType => {
    
    let type =  '' as NaradaEventType;

    switch (action) {
        case 'start':
            type = "CONTAINER_STARTED"
            break;
        case 'stop':
            type = "CONTAINER_STOPPED"
            break;
        case 'die':
            type = "CONTAINER_STOPPED"
            break;
        case 'restart':
            type = "CONTAINER_RESTARTED"
            break;
        case 'kill':
            type = "CONTAINER_KILLED"
            break;
    }

    return type;

}

export const mapDockerEventToNaradaEvent  = (dockerEvent:DockerEvent):NaradaEvent => {

    const isCritical = (currentState:ActionType) => ['die', "kill", "stop"].some(state => state === currentState)
    
    return {
        id:crypto.randomUUID(),
        source: "docker",
        type: actionMap(dockerEvent.Action),
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