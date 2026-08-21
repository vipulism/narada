import { CLASSIFIERS } from "../classifiers/classifier.registry";
import { todayIstDate } from "../classifiers/financial/financial.due";
import { SmsDueRepository } from "../importers/sms/smsDue.repository";
import {
    filterDueKnowledgeItems,
    settleDueKnowledgeItems,
    type KnowledgeItem,
} from "./knowledge.mapper";
import { matchesKnowledgeQuery } from "./knowledge.query";

const DUE_FETCH_CAP = 500;
const dues = new SmsDueRepository();

/**
 * Unique due bills with paid/overdue/open from received/credited card SMS.
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
    const [dueResult, payments] = await Promise.all([
        dues.list({
            page: 1,
            limit: DUE_FETCH_CAP,
            last4: options?.last4,
            bank: options?.bank,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        }),
        dues.listCardPaymentAcks({
            limit: DUE_FETCH_CAP,
            last4: options?.last4,
            classifier: preferred.name,
            classifierVersion: preferred.version,
        }),
    ]);

    const settled = settleDueKnowledgeItems(dueResult.items, payments);
    const bodies = new Map(dueResult.items.map((row) => [row.smsId, row.body]));

    return filterDueKnowledgeItems(settled, options?.status)
        .filter((item) => dueInTimeWindow(item, options?.from, options?.to))
        .filter((item) => matchesKnowledgeQuery(item, options?.q, bodies.get(item.id)));
}

function dueInTimeWindow(item: KnowledgeItem, from?: Date, to?: Date): boolean {
    if (item.type !== "due" || (!from && !to)) {
        return true;
    }

    const dueDay = item.payload.dueDate?.slice(0, 10);
    const day =
        dueDay ||
        todayIstDate(
            item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt)
        );

    if (from && day < todayIstDate(from)) {
        return false;
    }

    if (to && day > todayIstDate(to)) {
        return false;
    }

    return true;
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
