import { parseDocument, type StessaDocument } from "../models.js";
import { parseList, type ListQueryOptions, type StessaHttp } from "./envelope.js";

const ENDPOINT = "/api/v2/documents";

/** Documents (`GET /api/v2/documents`). */
export class DocumentsClient {
  constructor(private readonly http: StessaHttp) {}

  async list(options: ListQueryOptions = {}): Promise<StessaDocument[]> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (options.page !== undefined) query["page"] = options.page;
    if (options.perPage !== undefined) query["per_page"] = options.perPage;
    for (const [k, v] of Object.entries(options.scope ?? {})) query[k] = v;
    for (const [k, v] of Object.entries(options.filters ?? {})) query[`filter[${k}]`] = v;
    const payload = await this.http.request("GET", ENDPOINT, {
      query,
      signal: options.signal,
    });
    return parseList(payload, options.collectionKey ?? "documents").items.map(parseDocument);
  }

  /** Document categories (`GET /api/v2/document_categories`). */
  async categories(signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", "/api/v2/document_categories", { signal });
  }
}
