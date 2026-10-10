import { getChannel } from "./rabbitConnection"


export const setupRabbitTopology = async () => {
    
    const channel = getChannel();

    const exchange = process.env.RABBITMQ_EXCHANGE || "narada.events";
    const queue = process.env.RABBITMQ_QUEUE || "narada.events.process";
    const retryQueue = process.env.RABBITMQ_DB_RETRY_QUEUE || "narada.events.db-retry";
    const failedQueue = process.env.RABBITMQ_FAILED_QUEUE || "narada.events.failed";
    const retryDelayMs = Number(process.env.RABBITMQ_DB_RETRY_DELAY_MS || 5000);

    await channel.assertExchange(exchange, "topic", { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, "event.#");

    // Failed DB writes wait here instead of being immediately requeued in a hot loop.
    await channel.assertQueue(retryQueue, {
        durable: true,
        arguments: {
            "x-message-ttl": retryDelayMs,
            "x-dead-letter-exchange": exchange,
            "x-dead-letter-routing-key": "event.retry",
        },
    });

    // Events that exhaust retries are retained for inspection and manual recovery.
    await channel.assertQueue(failedQueue, { durable: true });

    console.log('🐰 RabbitMQ topology ready');
    
}
