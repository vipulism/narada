import { getChannel } from "./rabbitConnection"



export const setupRabbitTopology = async () => {
    
    const channel = getChannel();

    const exchange = process.env.RABBITMQ_EXCHANGE || "narada.events";
    const queue = process.env.RABBITMQ_QUEUE || "narada.events.process";

    await channel.assertExchange(exchange, "topic", { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, "event.#");
}

