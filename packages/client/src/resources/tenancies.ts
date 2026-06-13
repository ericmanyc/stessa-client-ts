import { parseTenancy, type StessaTenancy } from "../models.js";
import { parseList, parseOne, type ListQueryOptions, type StessaHttp } from "./envelope.js";

const ENDPOINT = "/api/v2/tenancies";

/** Tenancies / leases (`GET/POST/PUT/DELETE /api/v2/tenancies`). */
export class TenanciesClient {
  constructor(private readonly http: StessaHttp) {}

  async list(options: ListQueryOptions = {}): Promise<StessaTenancy[]> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (options.page !== undefined) query["page"] = options.page;
    for (const [k, v] of Object.entries(options.scope ?? {})) query[k] = v;
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`filter[${k}]`] = v;
    const payload = await this.http.request("GET", ENDPOINT, { query, signal: options.signal });
    return parseList(payload, options.collectionKey ?? "tenancies").items.map(parseTenancy);
  }

  async get(id: number | string, signal?: AbortSignal): Promise<StessaTenancy | null> {
    const payload = await this.http.request("GET", `${ENDPOINT}/${id}`, { signal });
    const one = parseOne(payload);
    return one ? parseTenancy(one) : null;
  }

  /** Expected rent schedules (`GET /api/v2/scheduled_incomes`). */
  async scheduledIncomes(
    scope: Record<string, string | number | boolean> = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.http.request("GET", "/api/v2/scheduled_incomes", { query: scope, signal });
  }
}
