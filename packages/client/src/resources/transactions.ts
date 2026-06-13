import { parseTransaction, type StessaTransaction } from "../models.js";
import { withQuery, type ListQueryOptions, type StessaHttp } from "./envelope.js";

/**
 * Transactions. The web3 Stessa app mixes two API surfaces (verified live):
 *  - list/create:    `/api/v2/transactions` (response `{ transactions: [...], total_pages, ... }`)
 *  - update/delete:  legacy `/api/transactions/{id}` (PUT) and
 *                    `/api/transactions/{firstId}.json` (DELETE, bulk by `transaction_ids`)
 *
 * `transaction_category_id` is the category; `property_id` is the property
 * assignment. Money is `{ cents, currency_iso }`.
 */
export interface TransactionListResult {
  items: StessaTransaction[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface TransactionListOptions extends ListQueryOptions {
  searchQuery?: string;
  deleted?: boolean;
  needsReview?: boolean;
}

export class TransactionsClient {
  constructor(private readonly http: StessaHttp) {}

  /** List transactions (`GET /api/v2/transactions`). */
  async list(options: TransactionListOptions = {}): Promise<TransactionListResult> {
    const query: Record<string, string | number | boolean | undefined> = {
      page: options.page ?? 1,
      per_page: options.perPage ?? 50,
    };
    if (options.searchQuery !== undefined) query["search_query"] = options.searchQuery;
    if (options.deleted !== undefined) query["deleted"] = options.deleted;
    if (options.needsReview !== undefined) query["needs_review"] = options.needsReview;
    for (const [k, v] of Object.entries(options.scope ?? {})) query[k] = v;
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`filter[${k}]`] = v;

    const payload = (await this.http.request("GET", withQuery("/api/v2/transactions", query), {
      signal: options.signal,
    })) as {
      transactions?: Array<Record<string, unknown>>;
      total_pages?: number;
      total_count?: number;
    } | null;

    const rows = payload?.transactions ?? [];
    return {
      items: rows.map(parseTransaction),
      page: query["page"] as number,
      totalPages: payload?.total_pages ?? 1,
      totalCount: payload?.total_count ?? rows.length,
    };
  }

  /** Fetch every page up to `maxResults`. */
  async listAll(maxResults = 200, options: TransactionListOptions = {}): Promise<StessaTransaction[]> {
    const result: StessaTransaction[] = [];
    let page = options.page ?? 1;
    while (result.length < maxResults) {
      options.signal?.throwIfAborted();
      const r = await this.list({ ...options, page });
      result.push(...r.items);
      if (r.items.length === 0 || page >= r.totalPages) break;
      page += 1;
    }
    return result.slice(0, maxResults);
  }

  /** Create a manual transaction (`POST /api/v2/transactions`). */
  async create(input: {
    name: string;
    transactionDate: string;
    amountCents: number;
    moneyIn?: boolean;
    transactionCategoryId?: number | null;
    propertyId?: number | null;
    notes?: string | null;
  }): Promise<unknown> {
    const transaction: Record<string, unknown> = {
      name: input.name,
      transaction_date: input.transactionDate,
      amount_cents: input.amountCents,
      money_in: input.moneyIn ?? input.amountCents > 0,
    };
    if (input.transactionCategoryId != null) transaction["transaction_category_id"] = input.transactionCategoryId;
    if (input.propertyId != null) transaction["property_id"] = input.propertyId;
    if (input.notes != null) transaction["notes"] = input.notes;
    return this.http.request("POST", "/api/v2/transactions", { body: { transaction } });
  }

  /**
   * Update fields on a transaction (`PUT /api/transactions/{id}`). Partial body
   * is accepted; only the provided fields change. Used by recategorize and
   * assignToProperty.
   */
  async update(
    id: number,
    fields: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<StessaTransaction | null> {
    const payload = (await this.http.request("PUT", `/api/transactions/${id}`, {
      body: { transaction: { id, ...fields } },
      signal,
    })) as Record<string, unknown> | null;
    return payload && typeof payload === "object" ? parseTransaction(payload) : null;
  }

  /** Recategorize a transaction by category id. */
  recategorize(id: number, transactionCategoryId: number, signal?: AbortSignal): Promise<StessaTransaction | null> {
    return this.update(id, { transaction_category_id: transactionCategoryId }, signal);
  }

  /** Assign (or move) a transaction to a property by property id. */
  assignToProperty(id: number, propertyId: number, signal?: AbortSignal): Promise<StessaTransaction | null> {
    return this.update(id, { property_id: propertyId }, signal);
  }

  /**
   * Soft-delete one or more transactions to Trash
   * (`DELETE /api/transactions/{firstId}.json`, bulk by `transaction_ids`).
   * Stessa keeps them in Trash and auto-purges after 30 days; there is no
   * immediate hard-delete.
   */
  async delete(ids: number[], signal?: AbortSignal): Promise<void> {
    if (ids.length === 0) return;
    await this.http.request("DELETE", `/api/transactions/${ids[0]}.json`, {
      body: { transaction: { transaction_ids: ids } },
      signal,
    });
  }

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
}
