import {  Router } from 'express';
import { ServicesConfig } from '../../config/loadServices.config';
import { createWebhookEvent } from '../../events/createWebhookEvent';
import { validateWebhookEventPayload } from '../../middlewares/validateWebhookEventPayload';
import { publishEvent } from '../../queue/eventPublisher';



export function createEventsRouter() {
    const router = Router();

    router.post("/events", validateWebhookEventPayload, async (req, res) => {

      const event = createWebhookEvent(req.body);

      publishEvent(event);

      res.status(202).json({ 
        accepted: true,
        eventId: event.id,
        source: event.source,
        type: event.type,
      });
    });
  
    return router;
  }

