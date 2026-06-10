import { spawn } from "child_process";
import { mapDockerEventToNaradaEvent } from "./dockerEventMapper";
import { publishEvent } from "../../queue/eventPublisher";

export function startDockerSource() {

  if (process.env.DOCKER_SOURCE_ENABLED !== "true") {
    console.log("🐳 Docker source disabled");
    return;
  }

  console.log("🐳 Docker source started");

  const docker = spawn("docker", [
    "events",
    "--format",
    "{{json .}}",
  ]);

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
}