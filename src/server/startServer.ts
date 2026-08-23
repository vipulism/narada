import express from "express";
import { mountAttentionDashboard } from "./publicDashboard";
import { createEventsRouter } from "./routes/events.route";
import { createImportsRouter } from "./routes/imports.route";
import { createAttentionRouter } from "./routes/attention.route";
import { createKnowledgeRouter } from "./routes/knowledge.route";
import { createMerchantsRouter } from "./routes/merchants.route";
import { createServiceRoutes } from "./routes/services.route";
import { createSmsRouter } from "./routes/sms.route";
import { createTimelineRouter } from "./routes/timeline.route";

/**
 * Starts the HTTP API, attention home, and merchants page.
 */
export function startServer() {
    const app = express();
    const port = process.env.PORT || 4000;

    app.use(express.json());
    app.get("/health", (_req, res) => res.json({ ok: true }));

    app.use(createEventsRouter());
    app.use(createServiceRoutes());
    app.use(createImportsRouter());
    app.use(createSmsRouter());
    app.use(createAttentionRouter());
    app.use(createKnowledgeRouter());
    app.use(createMerchantsRouter());
    app.use(createTimelineRouter());

    mountAttentionDashboard(app);

    app.listen(port, () => {
        console.log(`Narada HTTP listening on :${port}`);
    });

    return app;
}
