import {  Router } from 'express';
import { NaradaEvent } from '../../events/naradaEvent';
import { processEvent } from '../../events/processEvent';
import crypto from 'crypto';
import { ServicesConfig } from '../../config/loadServices.config';



export function createEventsRouter(config: ServicesConfig) {
    const router = Router();
  
    router.post("/events", async (req, res) => {
        const dummyEvent: NaradaEvent = {
            id: crypto.randomUUID(),
            source: "manual",
            type: "SERVICE_FAILED",
            severity: "critical",
            message: "Dummy webhook event received",
            timestamp: new Date(),
            service: {
              id: "dummy-webhook-service",
              name: "Dummy Webhook Service",
              critical: true,
            },
            metadata: {
              origin: "webhook",
              mode: "dummy",
            },
          };

        const result = await processEvent(dummyEvent, config);

        res.json({ events: 'ok', result })
    });
  
    return router;
  }





