
export let isPowerCastHealthy = true;
export type EndpointState = "healthy" | "slow" | "failed";
const endpointStates = new Map<string, EndpointState>();


export function getPowerCastHealth(): boolean {
    return isPowerCastHealthy;
}

export function setPowerCastHealth(value: boolean): void {
    isPowerCastHealthy = value;
}


export function getEndpointState(endpoint: string): EndpointState {
    return endpointStates.get(endpoint) ?? "healthy";
}

export function setEndpointState(endpoint: string, state: EndpointState): void {
    endpointStates.set(endpoint, state);
}