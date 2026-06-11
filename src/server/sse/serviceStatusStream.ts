import { Response } from "express";

const clients = new Set<Response>();

export const addServiceStatusClient = (res: Response) => {
    clients.add(res);

    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ ok: true })}\n\n`);

    return () => {
        clients.delete(res);
    };
};

export const publishServiceStatusUpdate = (payload: unknown) => {
    for (const client of clients) {
        client.write(`event: service-status\n`);
        client.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
};