import { ServicesConfig, ServicesDefaults, ServiceDefinition } from './../config/loadServices.config';
import { EndpointCheckResult } from './runService.check';
import axios from 'axios';
import { EndpointState } from '../state/service.state';

export async function httpsCheck(serviceConfig: ServicesConfig) {

    return await Promise.all(
        serviceConfig
            .services
            .map(service => getServiceResult(service, serviceConfig.defaults))
    );
}

const getServiceResult = async (service: ServiceDefinition, config: ServicesDefaults): Promise<EndpointCheckResult> => {
    console.log(`📡 Narada observes ${service.name}`);
    const start = Date.now();

    try {

        const response = await axios.get(service.url, { timeout: config.timeoutMs })
        const duration = Date.now() - start;
        const thresholdMs = (service.slowThresholdMs || config.slowThresholdMs);
        const status: EndpointState = duration > thresholdMs ? "slow" : "healthy";

        if (status === "slow") {
            console.warn("🟡 Slow endpoint detected", {
                endpoint: service.url,
                responseTime: `${duration}ms`,
            });
        } else {
            console.log("✅ Endpoint healthy", {
                endpoint: service.url,
                statusCode: response.status,
                responseTime: `${duration}ms`,
            });
        }

        return {
            endpoint: service.url,
            status,
            responseTimeMs: duration
        }

    } catch (error) {
        console.error("🔴 Endpoint failed", { endpoint: service.url });
        return {
            endpoint: service.url,
            status: "failed",
            error,
        };
    }

}