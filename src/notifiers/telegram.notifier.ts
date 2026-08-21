import axios from "axios";
import { Notifier } from "./notifier";
import { NaradaEvent } from "../events/naradaEvent";

/**
 * Sends Narada events and attention digests to Telegram.
 */
export class TelegramNotifier implements Notifier {

    name = 'telegram';

    /**
     * Sends an event message to the configured chat.
     *
     * @param event - Monitoring or webhook event
     */
    async send(event: NaradaEvent): Promise<void> {
        await this.sendHtml(event.message);
    }

    /**
     * Posts HTML text to the configured Telegram chat.
     *
     * @param text - HTML body (`parse_mode=HTML`)
     */
    async sendHtml(text: string): Promise<void> {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chat_id = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chat_id) {
            throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
        }

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id,
            text,
            parse_mode: 'HTML'
        });
    }
}


