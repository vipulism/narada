import express from 'express';
import { ServicesConfig } from '../config/loadServices.config';
import { createEventsRouter } from './routes/events.route';

export function startServer(config:ServicesConfig) {
   
    const app = express();
    const port = process.env.PORT;

    app.use(express.json());
    app.get('/health', (_req, res) => res.json({ ok: true }));

    app.use(createEventsRouter(config));
    

    app.listen(port, () => {
        console.log(`Narada HTTP listening on :${port}`);
      });

    return app;
  }
