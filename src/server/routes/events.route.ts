import {  Request, Response, Router } from 'express';
import { createWebhookEvent } from '../../events/createWebhookEvent';
import { validateWebhookEventPayload } from '../../middlewares/validateWebhookEventPayload';
import { publishEvent } from '../../queue/eventPublisher';
import { getEventById, getEvents } from '../../repositories/event.repository';



const createEvent = async (req:Request, res:Response) => {

  const event = createWebhookEvent(req.body);
  publishEvent(event);
  res.status(202).json({ 
    accepted: true,
    eventId: event.id,
    source: event.source,
    type: event.type,
  });
}

const getEventList = async (req:Request, res:Response) => {
  const events = await getEvents();
  res.status(200).json(events);
}

const getEvent = async (req:Request, res:Response) => {
  const eventId = req.params.id as string;
  const event = await getEventById(eventId);
  res.status(200).json(event);
}


export function createEventsRouter() {
    const router = Router();

    router.get("/events", getEventList);
    router.get("/event/:id", getEvent);
    router.post("/events", validateWebhookEventPayload, createEvent);
  
    return router;
}

