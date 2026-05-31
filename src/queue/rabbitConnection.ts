import amqplib, { Channel, ChannelModel } from "amqplib";

let channel: Channel;

export const connectRmq = async () => {

    if (!process.env.RABBITMQ_URL) {
        throw new Error("Missing RABBITMQ_URL");
    }

    const rabbitMQ_url = process.env.RABBITMQ_URL as string;

    const connection = await amqplib.connect(rabbitMQ_url, {
        recovery: {
          initialDelay: 200, // ms
          maxDelay: 5000, // ms
          factor: 2,
          jitter: 0.2,
          maxRetries: Infinity,
          async setup(model: ChannelModel) {
          channel = await model.createChannel();
            // await ch.assertQueue('tasks', {durable: true});
          },
        },
      });
      
      connection.on('connect', () => {
        console.log('🐰 rabbitMQ connected');
      });
      
      connection.on('disconnect', (err) => {
        console.warn('🐰 RabbitMQ disconnected', err.message);
      });
}


export const getChannel = () => {

    return channel;
}
