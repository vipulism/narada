import axios from "axios";
import { Notifier } from "./notifire";
import { NaradaEvent } from "../events/naradaEvent";
import { registerNotifier } from "./notifier.registry";

export async function sendTelegramMessage(text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chat_id) {
        throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    }

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id,
        text,
        parse_node: 'HTML'
    })

}

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
            parse_node: 'HTML'
        })
    }
}


