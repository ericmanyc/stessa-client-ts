import { parseProperty, type StessaProperty } from "../models.js";
import { parseList, parseOne, type ListQueryOptions, type StessaHttp } from "./envelope.js";

const ENDPOINT = "/api/v2/properties";

/** Properties (`GET/POST/PUT /api/v2/properties`). */
export class PropertiesClient {
  constructor(private readonly http: StessaHttp) {}

  async list(options: ListQueryOptions = {}): Promise<StessaProperty[]> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (options.page !== undefined) query["page"] = options.page;
    if (options.perPage !== undefined) query["per_page"] = options.perPage;
    for (const [k, v] of Object.entries(options.scope ?? {})) query[k] = v;
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`filter[${k}]`] = v;
    const payload = await this.http.request("GET", ENDPOINT, {
      query,
      signal: options.signal,
    });
    return parseList(payload, options.collectionKey ?? "properties").items.map(parseProperty);
  }

  /** Best-effort single property fetch (`GET /api/v2/properties/{id}`). */
  async get(id: number | string, signal?: AbortSignal): Promise<StessaProperty | null> {
    const payload = await this.http.request("GET", `${ENDPOINT}/${id}`, { signal });
    const one = parseOne(payload);
    return one ? parseProperty(one) : null;
  }

  /** Scheduled (expected) rent for a property (`GET .../{id}/scheduled_incomes`). */
  async scheduledIncomes(id: number | string, signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", `${ENDPOINT}/${id}/scheduled_incomes`, { signal });
  }
}
