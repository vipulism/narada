import axios, { AxiosInstance } from "axios";
import { Agent as HttpsAgent } from "node:https";
import { FireflyAccount, FireflyAccountCreate, PlannedFireflyTransaction } from "./firefly.types";

interface FireflyAccountsResponse {
    data?: Array<{
        id?: string;
        attributes?: {
            name?: string;
            type?: string;
            account_number?: string | null;
            account_role?: string | null;
            liability_type?: string | null;
            current_balance?: string | number | null;
        };
    }>;
    meta?: {
        pagination?: {
            current_page?: number;
            total_pages?: number;
        };
    };
}

interface InsightTotalEntry {
    difference?: string;
    difference_float?: number;
    currency_code?: string;
}

/**
 * Firefly III HTTP client. Transaction POST is idempotent via external_id in Narada.
 */
export class FireflyClient {
    private readonly http: AxiosInstance;

    /**
     * @param baseUrl - Firefly origin, e.g. https://dhan.apnalab.xyz
     * @param token - Personal access token
     * @param tlsInsecure - Skip TLS verify (homelab reverse-proxy cert)
     */
    constructor(baseUrl: string, token: string, tlsInsecure = false) {
        this.http = axios.create({
            baseURL: `${trimSlash(baseUrl)}/api/v1`,
            timeout: 15000,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.api+json",
                "Content-Type": "application/json",
            },
            httpsAgent: tlsInsecure
                ? new HttpsAgent({ rejectUnauthorized: false })
                : undefined,
        });
    }

    /**
     * INR income or expense total for a Dhan date range (`GET /insight/{kind}/total`).
     *
     * @param kind - Firefly insight type
     * @param start - Inclusive `YYYY-MM-DD`
     * @param end - Inclusive `YYYY-MM-DD`
     */
    async insightTotal(kind: "income" | "expense", start: string, end: string): Promise<number> {
        try {
            const response = await this.http.get<InsightTotalEntry[]>(`/insight/${kind}/total`, {
                params: { start, end },
            });

            return sumInrInsight(response.data ?? []);
        } catch (error) {
            throw fireflyHttpError(error, `GET /insight/${kind}/total`);
        }
    }

    /**
     * Asset and liability accounts only (banks, cards, loans).
     */
    async listLedgerAccounts(): Promise<FireflyAccount[]> {
        const [assets, liabilities] = await Promise.all([
            this.listAccountsByType("asset"),
            this.listAccountsByType("liability"),
        ]);

        return [...assets, ...liabilities];
    }

    /**
     * Creates one Firefly transaction. Returns the journal id.
     *
     * @param plan - Dry-run payload (withdrawal / deposit / transfer)
     */
    async createTransaction(plan: PlannedFireflyTransaction): Promise<string> {
        const split: Record<string, string> = {
            type: plan.type,
            date: plan.date,
            amount: plan.amount,
            description: plan.description || plan.type,
            external_id: plan.externalId,
            currency_code: "INR",
        };

        if (plan.sourceId) {
            split.source_id = plan.sourceId;
        }

        if (plan.destinationId) {
            split.destination_id = plan.destinationId;
        }

        if (plan.sourceName) {
            split.source_name = plan.sourceName;
        }

        if (plan.destinationName) {
            split.destination_name = plan.destinationName;
        }

        if (plan.categoryName) {
            split.category_name = plan.categoryName;
        }

        try {
            const response = await this.http.post<{ data?: { id?: string } }>(
                "/transactions",
                {
                    error_if_duplicate_hash: false,
                    apply_rules: true,
                    transactions: [split],
                }
            );
            const id = response.data?.data?.id?.trim();

            if (!id) {
                throw new Error("Firefly POST /transactions returned no id");
            }

            return id;
        } catch (error) {
            throw fireflyHttpError(error, "POST /transactions");
        }
    }

    /**
     * Creates one asset account. Does not update existing accounts.
     *
     * @param plan - Name, last4, opening balance, role
     */
    async createAccount(plan: FireflyAccountCreate): Promise<string> {
        const payload: Record<string, string | boolean> = {
            name: plan.name,
            type: "asset",
            account_role: plan.accountRole,
            currency_code: "INR",
            account_number: plan.accountNumber,
            opening_balance: plan.openingBalance,
            opening_balance_date: plan.openingBalanceDate,
            active: true,
            include_net_worth: true,
        };

        if (plan.notes) {
            payload.notes = plan.notes;
        }

        try {
            const response = await this.http.post<{ data?: { id?: string } }>(
                "/accounts",
                payload
            );
            const id = response.data?.data?.id?.trim();

            if (!id) {
                throw new Error("Firefly POST /accounts returned no id");
            }

            return id;
        } catch (error) {
            throw fireflyHttpError(error, "POST /accounts");
        }
    }

    /**
     * Updates fields on an existing account (e.g. opening balance).
     *
     * @param id - Firefly account id
     * @param fields - Subset of account attributes to change
     */
    async updateAccount(
        id: string,
        fields: {
            openingBalance?: string;
            openingBalanceDate?: string;
        }
    ): Promise<void> {
        const payload: Record<string, string> = {};

        if (fields.openingBalance !== undefined) {
            payload.opening_balance = fields.openingBalance;
        }

        if (fields.openingBalanceDate !== undefined) {
            payload.opening_balance_date = fields.openingBalanceDate;
        }

        try {
            await this.http.put(`/accounts/${id}`, payload);
        } catch (error) {
            throw fireflyHttpError(error, `PUT /accounts/${id}`);
        }
    }

    private async listAccountsByType(type: "asset" | "liability"): Promise<FireflyAccount[]> {
        const accounts: FireflyAccount[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const response = await this.getAccountsPage(type, page);
            totalPages = response.meta?.pagination?.total_pages ?? 1;

            for (const row of response.data ?? []) {
                const attributes = row.attributes ?? {};
                const id = row.id?.trim();
                const name = attributes.name?.trim();

                if (!id || !name) {
                    continue;
                }

                accounts.push({
                    id,
                    name,
                    type: attributes.type ?? type,
                    accountNumber: asOptionalString(attributes.account_number),
                    accountRole: asOptionalString(attributes.account_role),
                    liabilityType: asOptionalString(attributes.liability_type),
                    currentBalance:
                        attributes.current_balance == null
                            ? undefined
                            : String(attributes.current_balance),
                });
            }

            page += 1;
        }

        return accounts;
    }

    private async getAccountsPage(
        type: "asset" | "liability",
        page: number
    ): Promise<FireflyAccountsResponse> {
        try {
            const response = await this.http.get<FireflyAccountsResponse>("/accounts", {
                params: { type, page, limit: 50 },
            });

            return response.data;
        } catch (error) {
            throw fireflyHttpError(error, "GET /accounts");
        }
    }
}

/**
 * Builds a Firefly client from FIREFLY_URL and FIREFLY_TOKEN.
 */
export function loadFireflyClient(): FireflyClient {
    const baseUrl = process.env.FIREFLY_URL?.trim();
    const token = process.env.FIREFLY_TOKEN?.trim();

    if (!baseUrl || !token) {
        throw new Error("Missing FIREFLY_URL or FIREFLY_TOKEN");
    }

    const tlsInsecure = /^true|1|yes$/i.test(process.env.FIREFLY_TLS_INSECURE ?? "");

    return new FireflyClient(baseUrl, token, tlsInsecure);
}

function fireflyHttpError(error: unknown, action: string): Error {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const code = error.code ?? "";
        const body = error.response?.data as { message?: string } | undefined;
        const message = typeof body?.message === "string" ? body.message : undefined;

        if (code.includes("CERT") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
            return new Error(
                "Firefly TLS failed. Use FIREFLY_URL=http://192.168.1.32:8090 or FIREFLY_TLS_INSECURE=true"
            );
        }

        if (status) {
            return new Error(
                message
                    ? `Firefly ${action} failed (${status}): ${message}`
                    : `Firefly ${action} failed (${status})`
            );
        }

        return new Error(`Firefly ${action} failed (network)`);
    }

    return error instanceof Error ? error : new Error(`Firefly ${action} failed`);
}

function trimSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

function sumInrInsight(rows: InsightTotalEntry[]): number {
    const inr = rows.filter((row) => !row.currency_code || row.currency_code === "INR");
    const use = inr.length > 0 ? inr : rows;
    let sum = 0;

    for (const row of use) {
        const parsed =
            typeof row.difference_float === "number" && Number.isFinite(row.difference_float)
                ? row.difference_float
                : Number(row.difference);
        if (Number.isFinite(parsed)) {
            sum += Math.abs(parsed);
        }
    }

    return sum;
}

function asOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
