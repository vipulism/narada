import { ConsumeMessage } from "amqplib";
import { ServicesConfig } from "../config/loadServices.config";
import { NaradaEvent } from "../events/naradaEvent";
import { processEvent } from "../events/processEvent";
import { getChannel } from "./rabbitConnection"

export const eventConsumer = async (config:ServicesConfig) => {

    console.log("🐰 RabbitMQ event consumer started");
    
    const channel = getChannel();
    const queue = process.env.RABBITMQ_QUEUE || 'narada.events.process';
    await channel.consume(queue, async (message: ConsumeMessage | null) => {
        if(message){

            try {
                const event = JSON.parse(message.content.toString()) as NaradaEvent;
                await processEvent(event, config);
                channel.ack(message);
                console.log("🐰 consume", message.content.toString());

            } catch (error) {
                console.error(error);
                channel.nack(message, false, false); 
            }
        }else {
            console.log('🐰 Consumer cancelled by server');
        }
        
    })
}
