import { spawn } from "child_process";
import { getServicesStatus } from "../../repositories/service.repository";
import { publishEvent } from "../../queue/eventPublisher";
import { mapDockerEventToNaradaEvent } from "./dockerEventMapper";
import { parseDockerPsNames, runningContainerEvent } from "./dockerSnapshot";

const RECONCILE_MS = 5 * 60 * 1000;

const RUNNING_STATUSES = new Set(["CONTAINER_STARTED", "CONTAINER_RESTARTED"]);

/**
 * Listens to `docker events` and periodically aligns Home with `docker ps`.
 */
export function startDockerSource(): void {
    if (process.env.DOCKER_SOURCE_ENABLED !== "true") {
        console.log("🐳 Docker source disabled");
        return;
    }

    console.log("🐳 Docker source started");

    const docker = spawn("docker", ["events", "--format", "{{json .}}"]);

    docker.stdout.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);

        for (const line of lines) {
            try {
                const trimmedLine = line.trim();

                if (!trimmedLine.startsWith("{")) {
                    console.warn("🐳 Ignoring non-json docker output", trimmedLine);
                    continue;
                }

                const dockerEvent = JSON.parse(trimmedLine);
                const naradaEvent = mapDockerEventToNaradaEvent(dockerEvent);

                if (!naradaEvent) {
                    continue;
                }

                publishEvent(naradaEvent);
            } catch (error) {
                console.error("🐳 Failed to process docker event", error);
            }
        }
    });

    docker.stderr.on("data", (chunk) => {
        console.error("🐳 Docker event stream error", chunk.toString());
    });

    docker.on("close", (code) => {
        console.error("🐳 Docker event stream closed", { code });
    });

    void reconcileRunningContainers();
    setInterval(() => {
        void reconcileRunningContainers();
    }, RECONCILE_MS);
}

/**
 * Publishes CONTAINER_STARTED for every running container so last-event
 * kill/die from a stack bounce does not stick on Home.
 */
export async function reconcileRunningContainers(): Promise<void> {
    try {
        const names = await listRunningContainerNames();
        const latest = await getServicesStatus();
        const byId = new Map(latest.map((row) => [row.id, row.serviceStatus]));
        let published = 0;

        for (const name of names) {
            const status = byId.get(name);

            if (status && RUNNING_STATUSES.has(status)) {
                continue;
            }

            publishEvent(runningContainerEvent(name));
            published += 1;
        }

        console.info(`🐳 Reconciled running containers: ${names.length} up, ${published} status refreshed`);
    } catch (error) {
        console.error("🐳 Docker ps reconcile failed", error);
    }
}

function listRunningContainerNames(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const child = spawn("docker", ["ps", "--format", "{{json .}}"]);
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", reject);

        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `docker ps exited ${code}`));
                return;
            }

            resolve(parseDockerPsNames(stdout));
        });
    });
}
