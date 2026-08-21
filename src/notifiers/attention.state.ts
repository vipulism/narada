import { dueReminderKey } from "../classifiers/financial/financial.due";
export interface DueAlert {
    smsId: number;
    dueDate: string | null;
    amount: number | null;
    minDue: number | null;
    totalDue: number | null;
    bank: string | null;
    accountLast4: string | null;
    merchant?: string | null;
    dueParty?: string | null;
}

/**
 * A Firefly blocked row considered for Telegram (not skipped openings).
 */
export interface BlockedAlert {
    smsId: number;
    kind: string;
    amount: number;
    reason: string;
}

/**
 * Deltas after comparing this scan to the previous one.
 */
export interface AttentionDelta {
    seeded: boolean;
    newDues: DueAlert[];
    newBlocked: BlockedAlert[];
    repeatedBlocked: BlockedAlert[];
}

/**
 * In-memory change detection for dues and blocked Firefly pushes.
 * First scan seeds and does not notify (same as service state).
 */
export class AttentionAlertState {
    private seeded = false;
    private readonly dueKeys = new Set<string>();
    private readonly blocked = new Map<number, { scans: number; alert: BlockedAlert }>();

    /**
     * Diff this scan against remembered ids.
     *
     * @param dues - Current due reminders
     * @param blocked - Current blocked (not skipped) exceptions
     */
    diff(dues: DueAlert[], blocked: BlockedAlert[]): AttentionDelta {
        if (!this.seeded) {
            for (const due of dues) {
                this.dueKeys.add(dueReminderKey(due));
            }

            for (const row of blocked) {
                this.blocked.set(row.smsId, { scans: 1, alert: row });
            }

            this.seeded = true;

            return {
                seeded: true,
                newDues: [],
                newBlocked: [],
                repeatedBlocked: [],
            };
        }

        const newDues: DueAlert[] = [];

        for (const due of dues) {
            const key = dueReminderKey(due);

            if (!this.dueKeys.has(key)) {
                this.dueKeys.add(key);
                newDues.push(due);
            }
        }

        const seenBlocked = new Set(blocked.map((row) => row.smsId));
        const newBlocked: BlockedAlert[] = [];
        const repeatedBlocked: BlockedAlert[] = [];

        for (const row of blocked) {
            const prior = this.blocked.get(row.smsId);

            if (!prior) {
                this.blocked.set(row.smsId, { scans: 1, alert: row });
                newBlocked.push(row);
                continue;
            }

            prior.scans += 1;
            prior.alert = row;

            if (prior.scans === 2) {
                repeatedBlocked.push(row);
            }
        }

        for (const smsId of [...this.blocked.keys()]) {
            if (!seenBlocked.has(smsId)) {
                this.blocked.delete(smsId);
            }
        }

        return {
            seeded: false,
            newDues,
            newBlocked,
            repeatedBlocked,
        };
    }
}
