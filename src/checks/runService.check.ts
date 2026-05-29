import axios from "axios";
import { EndpointState } from "../state/service.state";


export type EndpointCheckResult = {
    endpoint: string;
    status: EndpointState;
    responseTimeMs?: number;
    error?: any
};

export async function checkPowerCast(): Promise<EndpointCheckResult[]> {
    const endpoints = ["/health", "/status/home-assistant", "/usage/today"];
    const SLOW_THRESHOLD_MS = Number(process.env.SLOW_THRESHOLD_MS || 2000);
    const baseUrl = process.env.POWERCAST_BASE_URL;
    if (!baseUrl) {
        throw new Error("POWERCAST_BASE_URL missing");
    }
    console.log("📡 Narada observes PowerCast");
    const results = await Promise.all(
        endpoints.map(async (endpoint): Promise<EndpointCheckResult> => {
            const start = Date.now();
            try {
                const url = `${baseUrl}${endpoint}`;
                const response = await axios.get(url, { timeout: 5000 });
                const duration = Date.now() - start;
                const status: EndpointState =
                    duration > SLOW_THRESHOLD_MS ? "slow" : "healthy";
                if (status === "slow") {
                    console.warn("🟡 Slow endpoint detected", {
                        endpoint,
                        responseTime: `${duration}ms`,
                    });
                } else {
                    console.log("✅ Endpoint healthy", {
                        endpoint,
                        statusCode: response.status,
                        responseTime: `${duration}ms`,
                    });
                }
                return {
                    endpoint,
                    status,
                    responseTimeMs: duration,
                };
            } catch (error) {
                console.error("🔴 Endpoint failed", { endpoint });
                return {
                    endpoint,
                    status: "failed",
                    error,
                };
            }
        })
    );
    return results;
}