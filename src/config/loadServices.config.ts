import fs from "fs";
import path from "path";


export type ServiceDefinition = {
    name: string;
    id: string;
    type: "http";
    url: string;
    critical: boolean;
    slowThresholdMs?: number;
    timeoutMs?: number;
};

export type ServicesDefaults = {
    intervalSeconds: number;
    timeoutMs: number;
    slowThresholdMs: number;
}

export type ServicesConfig = {
    defaults: ServicesDefaults;
    services: ServiceDefinition[];
};


export function loadServiceConfig() {

    const configPath = path.resolve(process.cwd(), process.env.SERVICES_CONFIG_PATH ?? "services.json");

    if (!fs.existsSync(configPath)) {
        throw new Error(`Services config not found at ${configPath}`);
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
}