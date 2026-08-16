import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FinancialEvent } from "../../classifiers/financial/financial.model";

const LEDGER_START = "2026-08-16";

interface OpeningsFile {
    defaultOpenOn?: string;
    openOn?: Record<string, string>;
}

/**
 * Ledger opening dates keyed by owned last4.
 */
export class FireflyOpenings {
    /**
     * @param openOnByLast4 - YYYY-MM-DD (Asia/Kolkata) per last4
     * @param defaultOpenOn - Used when the event last4 has no specific date
     */
    constructor(
        private readonly openOnByLast4: Map<string, string>,
        private readonly defaultOpenOn?: string
    ) {}

    /**
     * Skip reason when the event is before the Firefly opening for a involved last4.
     *
     * @param event - Posted financial event
     * @param sourceLast4 - Resolved debit/source last4
     */
    skipReason(event: FinancialEvent, sourceLast4?: string): string | undefined {
        const last4s = [sourceLast4, event.accountLast4, event.counterpartyLast4].filter(
            (value): value is string => Boolean(value)
        );
        const day = calendarDayIst(event.occurredAt);

        if (last4s.length === 0) {
            if (this.defaultOpenOn && day < this.defaultOpenOn) {
                return `before Firefly opening ${this.defaultOpenOn}`;
            }

            return undefined;
        }

        for (const last4 of last4s) {
            const openOn = this.openOnByLast4.get(last4) ?? this.defaultOpenOn;

            if (openOn && day < openOn) {
                return `before Firefly opening ${openOn} for last4 ${last4}`;
            }
        }

        return undefined;
    }
}

/**
 * Loads opening dates. Owned last4s default to 16 Aug 2026; the JSON file can override.
 *
 * @param ownedLast4s - Last4s from accounts.local.json
 */
export function loadFireflyOpenings(ownedLast4s: string[] = []): FireflyOpenings {
    const openOn: Record<string, string> = {};
    let defaultOpenOn = LEDGER_START;

    for (const last4 of ownedLast4s) {
        if (/^\d{4}$/.test(last4)) {
            openOn[last4] = defaultOpenOn;
        }
    }

    const configured = process.env.FIREFLY_OPENINGS_PATH;
    const filePath = resolve(configured ?? "config/firefly-openings.local.json");

    if (existsSync(filePath)) {
        const parsed = JSON.parse(readFileSync(filePath, "utf8")) as OpeningsFile;

        if (parsed.defaultOpenOn && /^\d{4}-\d{2}-\d{2}$/.test(parsed.defaultOpenOn)) {
            defaultOpenOn = parsed.defaultOpenOn;

            for (const last4 of Object.keys(openOn)) {
                openOn[last4] = defaultOpenOn;
            }
        }

        for (const [last4, day] of Object.entries(parsed.openOn ?? {})) {
            if (/^\d{4}$/.test(last4) && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
                openOn[last4] = day;
            }
        }
    }

    return new FireflyOpenings(new Map(Object.entries(openOn)), defaultOpenOn);
}

function calendarDayIst(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
