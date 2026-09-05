import { CLASSIFIERS } from "../classifiers/classifier.registry";
import { isDueInLookback } from "../classifiers/financial/financial.due";
import { DueMarkRepository } from "../db/repositories/dueMark.repository";
import { SmsDueRepository, type DueAnalysisSource } from "../importers/sms/smsDue.repository";
import {
    applyManualDueMarks,
    compareDueAttention,
    filterDueKnowledgeItems,
    keepCurrentCardDueKnowledgeItems,
    knowledgeDueReminderKey,
    settleDueKnowledgeItems,
    type KnowledgeItem,
} from "./knowledge.mapper";
import { matchesKnowledgeQuery } from "./knowledge.query";

const DUE_FETCH_CAP = 500;
const dues = new SmsDueRepository();
const marks = new DueMarkRepository();

/**
 * Unique due bills with paid/overdue/open from received/credited card SMS,
 * Unique due bills with paid/overdue/open from received/credited card SMS,
 * CRED/CheQ/SBI Cards/Axis bill-pay from savings, IGL confirmation / IGL
 * merchant spend, and Home `POST /knowledge/:id/paid`.
 * Default status omits paid (Telegram too) and lists one unpaid cycle per card.
 * Daily digest / alerts pass Home's 6-month `from` so Jan/Feb stale overdue
 * stay off Telegram the same way they stay off the default Home list.
 *
 * @param options - Optional last4, bank, from/to, status, and search
 */
export async function loadSettledDueKnowledge(options?: {
    last4?: string;
    bank?: string;
    from?: Date;
    to?: Date;
    status?: string;
    q?: string;
}): Promise<KnowledgeItem[]> {
    const preferred = preferredClassifier();
    const [dueResult, iglPending, cardPayments, utilityPayments] = await Promise.all([
        dues.list({
            page: 1,
            limit: DUE_FETCH_CAP,
            last4: options?.last4,
            bank: options?.bank,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        }),
        dues.listIglPendingDues({ limit: DUE_FETCH_CAP }),
        dues.listCardPaymentAcks({
            limit: DUE_FETCH_CAP,
            last4: options?.last4,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        }),
        dues.listUtilityDuePayments({
            limit: DUE_FETCH_CAP,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        }),
    ]);
    const dueSources = mergeDueSources(dueResult.items, iglPending);

    const settled = applyManualDueMarks(
        settleDueKnowledgeItems(dueSources, [...cardPayments, ...utilityPayments]),
        await marks.listKeys()
    );
    const bodies = new Map(dueSources.map((row) => [row.smsId, row.body]));
    const forDisplay =
        options?.status === "all" || options?.status === "paid"
            ? settled
            : keepCurrentCardDueKnowledgeItems(settled);

    return filterDueKnowledgeItems(forDisplay, options?.status)
        .filter((item) =>
            item.type !== "due" ||
            isDueInLookback(
                {
                    dueDate: item.payload.dueDate,
                    occurredAt:
                        item.occurredAt instanceof Date
                            ? item.occurredAt
                            : new Date(item.occurredAt),
                },
                options?.from,
                options?.to
            )
        )
        .filter((item) => matchesKnowledgeQuery(item, options?.q, bodies.get(item.id)))
        .sort(compareDueAttention);
}

/**
 * One row per SMS id, first group wins (analysis list, then IGL inbox scan).
 *
 * @param groups - Due candidate lists
 */
function mergeDueSources(...groups: DueAnalysisSource[][]): DueAnalysisSource[] {
    const seen = new Set<number>();
    const merged: DueAnalysisSource[] = [];

    for (const group of groups) {
        for (const row of group) {
            if (seen.has(row.smsId)) {
                continue;
            }

            seen.add(row.smsId);
            merged.push(row);
        }
    }

    return merged;
}

function preferredClassifier(): { name: string; version: string } {
    const classifier = CLASSIFIERS[0];

    if (!classifier) {
        throw new Error("No SMS classifiers registered");
    }

    return {
        name: classifier.name,
        version: classifier.version,
    };
}

/**
 * Marks or unmarks a due bill as paid in Narada. Does not post to Dhan.
 *
 * @param smsId - Due knowledge id (`sms_messages.id`)
 * @param paid - True to mark paid, false to clear the mark
 */
export async function setDuePaidMark(
    smsId: number,
    paid: boolean
): Promise<KnowledgeItem | undefined> {
    const current = (await loadSettledDueKnowledge({ status: "all" })).find(
        (item) => item.type === "due" && item.id === smsId
    );

    if (!current) {
        return undefined;
    }

    const key = knowledgeDueReminderKey(current);

    if (!key) {
        return undefined;
    }

    if (paid) {
        await marks.markPaid(key, smsId);
    } else {
        await marks.unmarkPaid(key);
    }

    return (await loadSettledDueKnowledge({ status: "all" })).find(
        (item) => item.type === "due" && item.id === smsId
    );
}
