import { NaradaEvent } from "../events/naradaEvent";
import { getChannel } from "./rabbitConnection";

// Publishes events to RabbitMQ channel

export const publishEvent = (event:NaradaEvent) => {

    const channel = getChannel();
    const exchange = process.env.RABBITMQ_EXCHANGE || "narada.events";

    const routingKey = `event.${event.source}.${event.type}`;
    const payload = Buffer.from(JSON.stringify(event));

    const published = channel.publish(exchange, routingKey, payload, {
        persistent: true,
        contentType: "application/json",
      });

    if (!published) {
    console.warn("🐰 RabbitMQ publish buffer is full", {
        eventId: event.id,
        routingKey,
    });
    }

    console.log("🐰 Event published", {
    eventId: event.id,
    routingKey,
    });

}
