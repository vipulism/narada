import { ConsumeMessage } from "amqplib";
import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { processEvent } from "../events/processEvent";
import { getChannel } from "./rabbitConnection"
import { markEventFailed, markEventProcessed, saveReceivedEvent } from "../repositories/event.repository";
import { publishServiceStatusUpdate } from "../server/sse/serviceStatusStream";

const DB_RETRY_QUEUE = process.env.RABBITMQ_DB_RETRY_QUEUE || "narada.events.db-retry";
const DB_FAILED_QUEUE = process.env.RABBITMQ_FAILED_QUEUE || "narada.events.failed";
const MAX_DB_RETRIES = 3;

const describeError = (error: unknown) => {
    if (error instanceof Error) {
        const dbError = error as Error & { code?: string; errno?: number; sqlState?: string };
        return {
            message: dbError.message,
            code: dbError.code,
            errno: dbError.errno,
            sqlState: dbError.sqlState,
        };
    }

    return { message: String(error) };
};

export const eventConsumer = async (config: ServicesConfig) => {

    console.log("🐰 RabbitMQ event consumer started");

    const channel = getChannel();
    const queue = process.env.RABBITMQ_QUEUE || 'narada.events.process';

    // Keep unacknowledged work bounded. A failed DB write must not create a hot requeue loop.
    await channel.prefetch(1);

    await channel.consume(queue, async (message: ConsumeMessage | null) => {
        if (message) {
            let event: NaradaEvent;

            try {
                event = JSON.parse(message.content.toString()) as NaradaEvent;
            } catch (error) {
                console.error("Invalid event JSON; sending message to failed queue", describeError(error));
                channel.sendToQueue(DB_FAILED_QUEUE, message.content, {
                    persistent: true,
                    contentType: message.properties.contentType || "application/json",
                    headers: { ...message.properties.headers, "x-narada-failure-reason": "invalid-json" },
                });
                channel.ack(message);
                return;
            }

            try {
                await saveReceivedEvent(event);
            }
            catch (error) {
                const headers = message.properties.headers || {};
                const retryCount = Number(headers["x-narada-db-retry-count"] || 0);

                console.error("event not saved in DB", {
                    eventId: event.id,
                    retryCount,
                    error: describeError(error),
                });

                if (retryCount < MAX_DB_RETRIES) {
                    // The retry queue has a TTL and dead-letters messages back to the main exchange.
                    channel.sendToQueue(DB_RETRY_QUEUE, message.content, {
                        persistent: true,
                        contentType: message.properties.contentType || "application/json",
                        headers: { ...headers, "x-narada-db-retry-count": retryCount + 1 },
                    });
                } else {
                    console.error("DB retries exhausted; preserving event in failed queue", {
                        eventId: event.id,
                        retryCount,
                    });
                    channel.sendToQueue(DB_FAILED_QUEUE, message.content, {
                        persistent: true,
                        contentType: message.properties.contentType || "application/json",
                        headers: { ...headers, "x-narada-failure-reason": "database-retries-exhausted" },
                    });
                }

                channel.ack(message);
                return;
            }


            try {
                await processEvent(event, config);
                await markEventProcessed(event.id);

                if (event.service?.id) {
                    publishServiceStatusUpdate({
                        id: event.service.id,
                        name: event.service.name,
                        critical: Boolean(event.service.critical),
                        source: event.source,
                        eventStatus: "processed",
                        serviceStatus: event.type,
                        severity: event.severity,
                        message: event.message,
                        lastEventAt: new Date().toISOString(),
                    });
                }

                channel.ack(message);
                console.log("🐰 consume", message.content.toString());

            } catch (error) {
                console.error(error);
                await markEventFailed(event.id, error);

                if (event.service?.id) {
                    publishServiceStatusUpdate({
                        id: event.service.id,
                        name: event.service.name,
                        critical: Boolean(event.service.critical),
                        source: event.source,
                        eventStatus: "failed",
                        serviceStatus: event.type,
                        severity: event.severity,
                        message: event.message,
                        lastEventAt: new Date().toISOString(),
                    });
                }


                channel.nack(message, false, false);
            }
        } else {
            console.log('🐰 Consumer cancelled by server');
        }

    })
}
