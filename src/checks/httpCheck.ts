import { ServicesConfig, ServicesDefaults, ServiceDefinition } from './../config/loadServices.config';
import { EndpointCheckResult } from './runService.check';
import axios from 'axios';
import { EndpointState } from '../state/service.state';

export async function runHttpChecks(serviceConfig: ServicesConfig) {

    const httpServices = serviceConfig.services.filter(service => {
        if (service.type !== "http") {
            console.warn("⚠️ Unsupported service type skipped", {
                service: service.name,
                type: service.type,
            });
            return false;
        }

        return true;
    });



    return await Promise.all(
        httpServices
            .map(service => {
                if (service.type === "http") {
                    return getHttpServiceResult(service, serviceConfig.defaults);
                }

                throw new Error(`Unsupported service type: ${service.type}`);
            })
    );
}

const getHttpServiceResult = async (service: ServiceDefinition, config: ServicesDefaults): Promise<EndpointCheckResult> => {
    console.log(`📡 Narada observes ${service.name}`);
    const start = Date.now();

    try {

        const timeoutMs = service.timeoutMs || config.timeoutMs;
        const response = await axios.get(service.url, { timeout: timeoutMs })
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
            serviceId: service.id,
            serviceName: service.name,
            endpoint: service.url,
            status,
            responseTimeMs: duration,
            critical: service.critical,
            checkedAt: new Date()
        }

    } catch (error) {
        console.error("🔴 Endpoint failed", { endpoint: service.url });
        return {
            endpoint: service.url,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            serviceId: service.id,
            serviceName: service.name,
            critical: service.critical,
            checkedAt: new Date()
        };
    }

}