import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { processEvent } from "../events/processEvent";
import { getChannel } from "./rabbitConnection"

export const eventConsumer = async (config:ServicesConfig) => {
    const channel = getChannel();
    const queue = process.env.RABBITMQ_QUEUE || 'narada.events.process';
    await channel.consume(queue, async (data) => {
        if(data){
            const event = JSON.parse(data.content.toString()) as NaradaEvent;
            
            await processEvent(event, config)
            channel.ack(data);
            console.log("🐰 consume", data.content.toString());
        }
        
    })
}
