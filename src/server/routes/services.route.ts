import { Request, Response, Router } from "express";
import { getServicesStatus } from "../../repositories/service.repository";


const getServices = async (req: Request, res: Response) => {
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

    return router;

} 