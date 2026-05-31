import { NaradaEvent } from "../events/naradaEvent";
import { getChannel } from "./rabbitConnection";

export const eventPublisher = (event:NaradaEvent) => {

    const channel = getChannel();
    const queue = process.env.RABBITMQ_QUEUE || "narada.events.process";
    
    channel.on('error', (err) => { console.error('Channel error:', err); });
    channel.on('handler-error', (err, event) => { console.error(`Uncaught exception in channel ${event} listener:`, err); });

    channel.sendToQueue(queue, Buffer.from('something to do'));


}