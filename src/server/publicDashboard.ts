import path from "node:path";
import express, { Express } from "express";

/**
 * Absolute path to the repo-root `public/` folder.
 *
 * Two levels above this file so the same resolution works from `src/server`
 * (ts-node) and `dist/server` (compiled / Docker).
 *
 * @returns Directory containing `index.html`
 */
export function resolvePublicDir(): string {
    return path.join(__dirname, "..", "..", "public");
}

/**
 * Serves the attention-only home UI (dues, blocked pushes, services, last import)
 * and `/merchants.html` (SMS merchant categories).
 *
 * Mount after API routers so `/health`, `/knowledge`, and `/services` stay JSON.
 *
 * @param app - Express application
 */
export function mountAttentionDashboard(app: Express): void {
    const publicDir = resolvePublicDir();

    app.use((req, res, next) => {
        if (req.path === "/" || req.path === "/index.html" || req.path === "/merchants.html") {
            res.setHeader("Cache-Control", "no-store");
        }
        next();
    });

    app.get("/dashboard", (_req, res) => {
        res.redirect(302, "/");
    });

    app.use(express.static(publicDir, { index: "index.html" }));
}
