import { GetEventsOptions } from './../../repositories/event.repository';
import { Request, Response, Router } from 'express';
import { createWebhookEvent } from '../../events/createWebhookEvent';
import { validateWebhookEventPayload } from '../../middlewares/validateWebhookEventPayload';
import { publishEvent } from '../../queue/eventPublisher';
import { getEventById, getEvents } from '../../repositories/event.repository';


const createEvent = async (req: Request, res: Response) => {

  const event = createWebhookEvent(req.body);
  publishEvent(event);
  return res.status(202).json({
    accepted: true,
    eventId: event.id,
    source: event.source,
    type: event.type,
  });
}

const getEventList = async (req: Request, res: Response) => {

  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;

  const result = await getEvents({ page, limit, status, type });

  return res.status(200).json({
    items: result.items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
    filters: {
      status: status ?? null,
      type: type ?? null,
    },
  });
}

const getEvent = async (req: Request, res: Response) => {
  const eventId = req.params.id as string;

  const event = await getEventById(eventId);

  if (!event) {
    return res.status(404).json({ message: "Event not found" });
  }
  return res.status(200).json(event);
}


export function createEventsRouter() {
  const router = Router();

  router.get("/events", getEventList);
  router.get("/events/:id", getEvent);
  router.post("/events", validateWebhookEventPayload, createEvent);

  return router;
}

