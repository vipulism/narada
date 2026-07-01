export function senderNormalize(sender: string): string {

    const upper = sender.toUpperCase();

    const parts = upper.split("-");

    if (parts.length === 3) {
        return parts[1];
    }

    if (parts.length === 2) {
        return parts[1];
    }

    return upper;
}