import { ServicesConfig, ServicesDefaults, ServiceDefinition } from './../config/loadServices.config';
import axios from 'axios';
import { NaradaEvent } from '../events/naradaEvent';
import { createHttpEvent } from './httpEventFactory';


export async function runHttpChecks(serviceConfig: ServicesConfig): Promise<NaradaEvent[]> {

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
            .map(service =>
                getHttpServiceResult(service, serviceConfig.defaults)
            )
    );
}

const getHttpServiceResult = async (service: ServiceDefinition, config: ServicesDefaults): Promise<NaradaEvent> => {
    console.log(`📡 Narada observes ${service.name}`);
    const start = Date.now();

    try {

        const timeoutMs = service.timeoutMs || config.timeoutMs;
        const response = await axios.get(service.url, { timeout: timeoutMs })
        const duration = Date.now() - start;
        const thresholdMs = (service.slowThresholdMs || config.slowThresholdMs);
        const status = duration > thresholdMs ? "slow" : "healthy";

        const type: NaradaEvent["type"] = status === "slow" ? "SERVICE_SLOW" : "SERVICE_HEALTHY";
        const severity: NaradaEvent["severity"] =  status === "slow" ? "warning" : "info";

        return createHttpEvent({
            service,
            type: type,
            severity: severity,
            responseTimeMs: duration,
            statusCode: response.status,
            thresholdMs,
        })

    } catch (error) {

        const severity: NaradaEvent["severity"] = service.critical ? "critical" : "warning";
        const type: NaradaEvent["type"] = "SERVICE_FAILED";

        return createHttpEvent({
            service,
            type: type,
            severity: severity,
            error:error instanceof Error ? error.message : String(error)
        })
    }

}


