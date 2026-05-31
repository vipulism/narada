import {  Router } from 'express';
import { processEvent } from '../../events/processEvent';
import { ServicesConfig } from '../../config/loadServices.config';
import { createWebhookEvent } from '../../events/createWebhookEvent';
import { validateWebhookEventPayload } from '../../middlewares/validateWebhookEventPayload';
import { eventPublisher } from '../../queue/eventPublisher';



export function createEventsRouter(config: ServicesConfig) {
    const router = Router();

    router.post("/events", validateWebhookEventPayload, async (req, res) => {

      const event = createWebhookEvent(req.body);

      await processEvent(event, config);

      eventPublisher(event);

      res.status(202).json({ 
        accepted: true,
        eventId: event.id,
        source: event.source,
        type: event.type,
      });
    });
  
    return router;
  }

