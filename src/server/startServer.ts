import express from 'express';
import { ServicesConfig } from '../config/loadServices.config';
import { createEventsRouter } from './routes/events.route';
import { createServiceRoutes } from './routes/services.route';

export function startServer() {

  const app = express();
  const port = process.env.PORT || 4000;

  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use(createEventsRouter());
  app.use(createServiceRoutes());

  app.listen(port, () => {
    console.log(`Narada HTTP listening on :${port}`);
  });

  return app;
}
