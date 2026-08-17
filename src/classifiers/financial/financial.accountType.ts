import { KnownAccount } from "./knownAccount.model";

const SAVINGS_TXN_TYPES = new Set(["UPI", "IMPS", "NEFT", "RTGS", "NFS"]);

/**
 * Infers owned account type from SMS text when last4 is missing.
 * Credit-card-as-UPI-pay-channel is ignored so "Visa Credit Card Pay" stays savings.
 *
 * @param body - Raw SMS body
 */
export function inferOwnedAccountType(body: string): KnownAccount["type"] | undefined {
    const upper = body.toUpperCase();

    if (/\bFASTAG\b/.test(upper) || (/\bTOLL PAID\b/.test(upper) && /\bTAG\b/.test(upper))) {
        return "wallet";
    }

    if (namesCreditCard(body)) {
        return "credit_card";
    }

    if (/\bHOME\s+LOAN\b/.test(upper) || /\bMORTGAGE\b/.test(upper)) {
        return "loan";
    }

    if (
        /\b(?:ACCT|ACC|A\/C|ACCOUNT)\b/.test(upper) &&
        !/\bCARD\b/.test(upper)
    ) {
        return "savings";
    }

    return undefined;
}

/**
 * True when the SMS is about a credit card product, not a card used only as UPI rail.
 *
 * @param body - Raw SMS body
 */
export function namesCreditCard(body: string): boolean {
    const withoutPayChannel = body.replace(/\b(?:visa\s+)?credit\s+card\s+pay\b/gi, "");

    return (
        /\bCREDIT\s+CARD\b/i.test(withoutPayChannel) ||
        /\bSBI\s+CC\b/i.test(withoutPayChannel) ||
        /\bSBI\s+CARD\b/i.test(withoutPayChannel)
    );
}

/**
 * Weaker type hint from a posted event when the SMS body is not available.
 *
 * @param transactionType - Parsed rail (UPI, IMPS, …)
 */
export function inferOwnedAccountTypeFromTxn(
    transactionType: string | undefined
): KnownAccount["type"] | undefined {
    if (!transactionType) {
        return undefined;
    }

    const normalized = transactionType.trim().toUpperCase();

    if (SAVINGS_TXN_TYPES.has(normalized)) {
        return "savings";
    }

    return undefined;
}
