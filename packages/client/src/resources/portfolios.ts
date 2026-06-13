import { parsePortfolio, type StessaPortfolio } from "../models.js";
import { parseList, type ListQueryOptions, type StessaHttp } from "./envelope.js";

const ENDPOINT = "/api/v2/portfolios";

/** Portfolios (`GET/POST /api/v2/portfolios`). */
export class PortfoliosClient {
  constructor(private readonly http: StessaHttp) {}

  async list(options: ListQueryOptions = {}): Promise<StessaPortfolio[]> {
    const payload = await this.http.request("GET", ENDPOINT, { signal: options.signal });
    return parseList(payload, options.collectionKey ?? "portfolios").items.map(parsePortfolio);
  }

  /** Portfolio-level summary metrics (`GET /api/v2/summary`). */
  async summary(signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", "/api/v2/summary", { signal });
  }
}
