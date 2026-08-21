import crypto from "node:crypto";
import { NaradaEvent } from "../../events/naradaEvent";

/**
 * Builds a quiet "running now" snapshot event so Home matches `docker ps`,
 * not the last kill/die from a compose restart.
 *
 * @param name - Container name (`docker` actor name)
 */
export function runningContainerEvent(name: string): NaradaEvent {
    const trimmed = name.replace(/^\//, "").trim();

    return {
        id: crypto.randomUUID(),
        source: "docker",
        type: "CONTAINER_STARTED",
        severity: "info",
        message: `Container ${trimmed} is running`,
        service: {
            id: trimmed,
            name: trimmed,
            critical: false,
        },
        timestamp: new Date(),
        metadata: { reconcile: true },
    };
}

/**
 * Parses `docker ps --format '{{json .}}'` lines into container names.
 *
 * @param output - Raw stdout
 */
export function parseDockerPsNames(output: string): string[] {
    const names: string[] = [];

    for (const line of output.split("\n")) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("{")) {
            continue;
        }

        try {
            const row = JSON.parse(trimmed) as { Names?: unknown; names?: unknown };
            const raw = typeof row.Names === "string" ? row.Names : typeof row.names === "string" ? row.names : "";

            for (const name of raw.split(",")) {
                const cleaned = name.replace(/^\//, "").trim();
                if (cleaned) {
                    names.push(cleaned);
                }
            }
        } catch {
            continue;
        }
    }

    return [...new Set(names)];
}

/**
 * Locked parse cases for `docker ps` JSON names and snapshot events.
 */
export function runDockerSnapshotRegression(): void {
    const failures: string[] = [];
    const names = parseDockerPsNames(
        [
            '{"Names":"narada","State":"running"}',
            '{"Names":"/mariadb","State":"running"}',
            "not json",
            '{"Names":"immich_server,immich_server_alias"}',
        ].join("\n")
    );

    if (!names.includes("narada") || !names.includes("mariadb") || !names.includes("immich_server")) {
        failures.push(`docker ps names ${names.join(",")}`);
    }

    const event = runningContainerEvent("/dozzle");

    if (event.type !== "CONTAINER_STARTED" || event.service?.id !== "dozzle" || !event.metadata?.reconcile) {
        failures.push("running snapshot should be CONTAINER_STARTED with reconcile metadata");
    }

    if (failures.length > 0) {
        throw new Error(`docker snapshot regression failed:\n${failures.join("\n")}`);
    }
}
