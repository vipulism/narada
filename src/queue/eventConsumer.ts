import { ConsumeMessage } from "amqplib";
import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { processEvent } from "../events/processEvent";
import { getChannel } from "./rabbitConnection"
import { markEventFailed, markEventProcessed, saveReceivedEvent } from "../repositories/event.repository";
import { publishServiceStatusUpdate } from "../server/sse/serviceStatusStream";

export const eventConsumer = async (config: ServicesConfig) => {

    console.log("🐰 RabbitMQ event consumer started");

    const channel = getChannel();
    const queue = process.env.RABBITMQ_QUEUE || 'narada.events.process';
    await channel.consume(queue, async (message: ConsumeMessage | null) => {
        if (message) {

            const event = JSON.parse(message.content.toString()) as NaradaEvent;


            try {
                await saveReceivedEvent(event);
            }
            catch (error) {
                console.log("event not saved in DB");
                channel.nack(message, false, true);
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
