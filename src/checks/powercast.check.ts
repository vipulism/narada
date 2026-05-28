import axios from "axios";


const BASE_URL = process.env.POWERCAST_BASE_URL;
const endpoints = [
    "/health",
    "/status",
    "/usage/today",
];

export async function checkPowerCast(): Promise<void> {
    if (!BASE_URL) {
        throw new Error("POWERCAST_BASE_URL missing");
    }

    console.log("📡 Narada observes PowerCast");

    for (const endpoint of endpoints) {
        const start = Date.now();

        try {
            const response = await axios.get(`${BASE_URL}${endpoint}`, {
                timeout: 5000
            });

            const duration = Date.now() - start;

            console.log("✅ Endpoint healthy", {
                endpoint,
                status: response.status,
                responseTime: `${duration}ms`,
            });

        } catch (error) {
            console.error("🔴 Endpoint failed", {
                endpoint,
            });

            throw error;

        }
    }


}