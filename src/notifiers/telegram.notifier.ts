import axios from "axios";
import { Notifier } from "./notifier";
import { NaradaEvent } from "../events/naradaEvent";

export class TelegramNotifier implements Notifier {

    name = 'telegram';

    async send(event: NaradaEvent) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chat_id = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chat_id) {
            throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
        }

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id,
            text:event.message,
            parse_mode: 'HTML'
        })
    }
}


