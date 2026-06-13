/**
 * Stessa response envelopes and the generic resource client.
 *
 * Stessa uses two envelope styles (see docs/api-findings.md):
 *  - Core `/api/v2/*`: `{ data: ... }`. Collections may be a bare array
 *    (`{ data: [...] }`) or nest a named array (`{ data: { portfolios: [...],
 *    pagination } }`). Pagination is custom: `{ page, per_page, total_pages }`.
 *  - Banking `/api/v2/banking/*` (proxied from Unit): JSON:API, i.e.
 *    `{ data: { id, type, attributes } }` or `{ data: [ {id,type,attributes} ] }`.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  /** JSON-serializable request body; sent as `application/json`. */
  body?: unknown;
  /** Extra query parameters appended to the path. */
  query?: Record<string, string | number | boolean | undefined | null> | undefined;
  signal?: AbortSignal | undefined;
}

/** The minimal HTTP surface the resource clients depend on (implemented by StessaClient). */
export interface StessaHttp {
  request<T = unknown>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
}

export interface PageInfo {
  page: number;
  perPage: number;
  totalPages: number;
  total: number | null;
}

export interface StessaList<T = Record<string, unknown>> {
  items: T[];
  pagination: PageInfo;
}

function emptyPage(): PageInfo {
  return { page: 1, perPage: 0, totalPages: 1, total: null };
}

function readPagination(source: Record<string, unknown> | undefined, count: number): PageInfo {
  const pag = (source ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined;
  return {
    page: num(pag["page"] ?? pag["current_page"]) ?? 1,
    perPage: num(pag["per_page"] ?? pag["perPage"]) ?? count,
    totalPages: num(pag["total_pages"] ?? pag["last_page"]) ?? 1,
    total: num(pag["total"]) ?? null,
  };
}

/**
 * Unwrap a Stessa `{ data: ... }` collection into a flat item list. When the
 * inner `data` is an object, the first array-valued property (other than
 * `pagination`) is taken as the collection, and an optional `collectionKey`
 * pins which one. JSON:API banking objects are flattened to `{ id, type,
 * ...attributes }`.
 */
export function parseList(payload: unknown, collectionKey?: string): StessaList {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = root["data"];

  if (Array.isArray(data)) {
    return {
      items: data.map(flattenItem),
      pagination: readPagination(
        (root["meta"] as Record<string, unknown>) ?? (root["pagination"] as Record<string, unknown>),
        data.length,
      ),
    };
  }

  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    let collection: unknown;
    if (collectionKey && Array.isArray(inner[collectionKey])) {
      collection = inner[collectionKey];
    } else {
      for (const [key, value] of Object.entries(inner)) {
        if (key !== "pagination" && Array.isArray(value)) {
          collection = value;
          break;
        }
      }
    }
    if (Array.isArray(collection)) {
      return {
        items: collection.map(flattenItem),
        pagination: readPagination(inner["pagination"] as Record<string, unknown>, collection.length),
      };
    }
    // Single object under data (e.g. JSON:API single resource).
    return { items: [flattenItem(inner)], pagination: emptyPage() };
  }

  return { items: [], pagination: emptyPage() };
}

/** Unwrap a single-resource `{ data: {...} }` envelope to a flat object. */
export function parseOne(payload: unknown): Record<string, unknown> | null {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = root["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data && typeof data === "object" ? null : null;
  }
  return flattenItem(data as Record<string, unknown>);
}

/** Flatten a JSON:API `{ id, type, attributes }` object; pass others through. */
export function flattenItem(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") {
    return { value: item } as Record<string, unknown>;
  }
  const obj = item as Record<string, unknown>;
  const attributes = obj["attributes"];
  if (attributes && typeof attributes === "object") {
    return {
      ...(attributes as Record<string, unknown>),
      id: obj["id"],
      type: obj["type"],
    };
  }
  return obj;
}

/** Append query parameters to a path, skipping null/undefined values. */
export function withQuery(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!query) {
    return path;
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (parts.length === 0) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

export interface ListQueryOptions {
  page?: number;
  perPage?: number;
  /** Spatie-style filters -> `filter[key]=value`. */
  filters?: Record<string, string | number | boolean>;
  /** Scope params sent as-is, e.g. `{ portfolio_id: 1, property_id: 2 }`. */
  scope?: Record<string, string | number | boolean>;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  /** Pin which nested array under `data` is the collection. */
  collectionKey?: string;
  signal?: AbortSignal;
}

function buildListQuery(
  options: ListQueryOptions,
): Record<string, string | number | boolean | undefined> {
  const query: Record<string, string | number | boolean | undefined> = {};
  if (options.page !== undefined) query["page"] = options.page;
  if (options.perPage !== undefined) query["per_page"] = options.perPage;
  if (options.sortColumn !== undefined) query["sort[column]"] = options.sortColumn;
  if (options.sortDirection !== undefined) query["sort[direction]"] = options.sortDirection;
  for (const [k, v] of Object.entries(options.scope ?? {})) {
    query[k] = v;
  }
  for (const [k, v] of Object.entries(options.filters ?? {})) {
    query[`filter[${k}]`] = v;
  }
  return query;
}

/**
 * Generic client over a single Stessa endpoint, returned by
 * `client.resource(endpoint)`. Reaches any resource in the catalog even when it
 * has no bespoke typed client.
 */
export class ResourceClient {
  constructor(
    private readonly http: StessaHttp,
    private readonly endpoint: string,
  ) {}

  async list(options: ListQueryOptions = {}): Promise<StessaList> {
    const payload = await this.http.request(
      "GET",
      withQuery(this.endpoint, buildListQuery(options)),
      { signal: options.signal },
    );
    return parseList(payload, options.collectionKey);
  }

  /** Fetch every page up to `maxResults`, following `total_pages`. */
  async listAll(maxResults = 300, options: ListQueryOptions = {}): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = [];
    let page = options.page ?? 1;
    while (result.length <= maxResults) {
      options.signal?.throwIfAborted();
      const { items, pagination } = await this.list({ ...options, page });
      result.push(...items);
      if (items.length === 0 || page >= pagination.totalPages) {
        break;
      }
      page += 1;
    }
    return result;
  }

  async get(id: number | string, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    const payload = await this.http.request("GET", `${this.endpoint}/${id}`, { signal });
    return parseOne(payload);
  }

  async create(body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request("POST", this.endpoint, { body, signal });
  }

  async update(id: number | string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.http.request("PUT", `${this.endpoint}/${id}`, { body, signal });
  }

  async delete(id: number | string, signal?: AbortSignal): Promise<void> {
    await this.http.request("DELETE", `${this.endpoint}/${id}`, { signal });
  }
}
