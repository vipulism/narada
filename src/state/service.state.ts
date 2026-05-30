import { NaradaEventType } from "../events/naradaEvent";

export let isPowerCastHealthy = true;
const endpointStates = new Map<string, NaradaEventType>();


export function getPowerCastHealth(): boolean {
    return isPowerCastHealthy;
}

export function setPowerCastHealth(value: boolean): void {
    isPowerCastHealthy = value;
}


export function getEndpointState(endpoint: string): NaradaEventType {
    return endpointStates.get(endpoint) ?? "SERVICE_HEALTHY";
}

export function setEndpointState(endpoint: string, state: NaradaEventType): void {
    endpointStates.set(endpoint, state);
}