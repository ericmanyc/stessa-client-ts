import type { ListQueryOptions, StessaHttp } from "./envelope.js";

/**
 * Transactions. Stessa exposes a few discrete read endpoints rather than a
 * single REST list; the broad transaction list/report comes from `report_data`.
 * Writes go through `create` (`POST /api/v2/transactions`).
 */
export class TransactionsClient {
  constructor(private readonly http: StessaHttp) {}

  /** Category list (`GET /api/v2/transaction_categories`). */
  async categories(signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", "/api/v2/transaction_categories", { signal });
  }

  /** Income/expense rollups (`GET /api/v2/transactions/transactions_summary`). */
  async summary(
    scope: Record<string, string | number | boolean> = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.http.request("GET", "/api/v2/transactions/transactions_summary", {
      query: scope,
      signal,
    });
  }

  /** Transactions still awaiting categorization (`GET .../almost_categorized`). */
  async almostCategorized(signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", "/api/v2/transactions/almost_categorized", { signal });
  }

  /** Tabular report data, the source for broad transaction listings. */
  async reportData(options: ListQueryOptions = {}): Promise<unknown> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (options.page !== undefined) query["page"] = options.page;
    if (options.perPage !== undefined) query["per_page"] = options.perPage;
    for (const [k, v] of Object.entries(options.scope ?? {})) query[k] = v;
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`filter[${k}]`] = v;
    return this.http.request("GET", "/api/v2/report_data", { query, signal: options.signal });
  }

  /** Create a transaction (`POST /api/v2/transactions`). Body shape is caller-supplied. */
  async create(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request("POST", "/api/v2/transactions", { body, signal });
  }
}
