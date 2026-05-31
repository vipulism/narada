import amqplib, { Channel, RecoveringChannelModel } from "amqplib";

let connection: RecoveringChannelModel;
let channel: Channel;

export const connectRmq = async () => {

    if (!process.env.RABBITMQ_URL) {
        throw new Error("Missing RABBITMQ_URL");
    }

    const rabbitMQ_url = process.env.RABBITMQ_URL as string;

    connection = await amqplib.connect(rabbitMQ_url, {
        recovery: {
          initialDelay: 200, // ms
          maxDelay: 5000, // ms
          factor: 2,
          jitter: 0.2,
          maxRetries: Infinity,
        },
      });

    channel = await connection.createChannel();
      
    connection.on('connect', () => {
        console.log('🐰 rabbitMQ connected');
    });
    
    connection.on('disconnect', (err) => {
        console.warn('🐰 RabbitMQ disconnected', err.message);
    });
}


export const getChannel = () => {
    if (!channel) {
        throw new Error("RabbitMQ channel not initialized");
      }
    return channel;
}
