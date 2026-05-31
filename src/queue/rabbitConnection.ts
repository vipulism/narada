import amqplib from "amqplib";

export const connectRmq = async () => {

    const rabbitMQ_url = process.env.RABBITMQ_URL as string;

    const connection = await amqplib.connect(rabbitMQ_url, {
        recovery: {
          initialDelay: 200, // ms
          maxDelay: 5000, // ms
          factor: 2,
          jitter: 0.2,
          maxRetries: Infinity,
          async setup(model:any) {
            // Called after every successful (re)connect.
            // Recreate topology/consumers here.
            const ch = await model.createChannel();
            await ch.assertQueue('tasks', {durable: true});
          },
        },
      });
      
      connection.on('connect', () => {
        console.log('🐰 rabbitMQ connected');
      });
      
      connection.on('disconnect', (err) => {
        console.warn('disconnected', err.message);
      });
}