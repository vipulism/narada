import {  Request, Response, Router } from 'express';
import { createWebhookEvent } from '../../events/createWebhookEvent';
import { validateWebhookEventPayload } from '../../middlewares/validateWebhookEventPayload';
import { publishEvent } from '../../queue/eventPublisher';
import { getEventById, getEvents } from '../../repositories/event.repository';
import { NaradaEvent } from '../../events/naradaEvent';



const createEvent = async (req:Request, res:Response) => {

  const event = createWebhookEvent(req.body);
  publishEvent(event);
  return res.status(202).json({ 
    accepted: true,
    eventId: event.id,
    source: event.source,
    type: event.type,
  });
}

const getEventList = async (req:Request, res:Response) => {
  const events = await getEvents();

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }else {
   return res.status(200).json(events);
  }
}

const getEvent = async (req:Request, res:Response) => {
  const eventId = req.params.id as string;
  const events = await getEventById(eventId) as NaradaEvent[];

  return res.status(200).json(events[0]);
}


export function createEventsRouter() {
    const router = Router();

    router.get("/events", getEventList);
    router.get("/events/:id", getEvent);
    router.post("/events", validateWebhookEventPayload, createEvent);
  
    return router;
}

