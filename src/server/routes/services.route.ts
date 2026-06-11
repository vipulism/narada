import { Request, Response, Router } from "express";
import { getServicesStatus } from "../../repositories/service.repository";
import { addServiceStatusClient } from "../sse/serviceStatusStream";


const streamServices = async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const removeClient = addServiceStatusClient(res);

    req.on("close", removeClient);
};

const getServices = async (_req: Request, res: Response) => {
    const services = await getServicesStatus();

    const response = services.map((service) => ({
        ...service,
        critical: Boolean(service.critical),
    }));

    return res.status(200).json(response)
}

export const createServiceRoutes = () => {

    const router = Router();

    router.get("/services", getServices);
    router.get("/services/stream", streamServices);

    return router;

} 