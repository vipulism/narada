import { SenderInfo } from "./sender.model";

export function senderNormalize(address: string): SenderInfo {

    const normalized = address.trim().toUpperCase();
    const parts = normalized.split("-");

    if (parts.length === 3) {
        return {
            original: normalized,
            prefix: parts[0],
            sender: parts[1],
            suffix: parts[2],
        };
    }

    if (parts.length === 2) {
        return {
            original: normalized,
            prefix: parts[0],
            sender: parts[1],
        };
    }

    return {
        original: normalized,
        sender: normalized,
    };
}