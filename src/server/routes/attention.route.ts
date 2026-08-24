import { Request, Response, Router } from "express";
import { sendDailyAttentionDigest } from "../../notifiers/attention.alerts";

/**
 * POST /attention/digest — send today's Telegram daily attention now.
 */
export function createAttentionRouter(): Router {
    const router = Router();

    router.post("/attention/digest", sendAttentionDigest);

    return router;
}

/**
 * On-demand daily digest. Always attempts Telegram; records the IST day on success.
 */
async function sendAttentionDigest(_req: Request, res: Response): Promise<void> {
    const result = await sendDailyAttentionDigest({ force: true });

    if (result.sent) {
        res.status(200).json(result);
        return;
    }

    const status = result.reason?.includes("TELEGRAM") ? 503 : 502;
    res.status(status).json(result);
}
