import { parseBankAccount, type StessaBankAccount } from "../models.js";
import { parseList, parseOne, type StessaHttp } from "./envelope.js";

const ENDPOINT = "/api/v2/banking";

/**
 * Banking, proxied from Unit (JSON:API responses). Reads only; money moves
 * (transfers, cards) are intentionally left to the `stessa_request` escape
 * hatch so they are explicit.
 */
export class BankingClient {
  constructor(private readonly http: StessaHttp) {}

  /** `GET /api/v2/banking/accounts`. */
  async accounts(signal?: AbortSignal): Promise<StessaBankAccount[]> {
    const payload = await this.http.request("GET", `${ENDPOINT}/accounts`, { signal });
    return parseList(payload).items.map(parseBankAccount);
  }

  /** `GET /api/v2/banking/accounts/{id}`. */
  async account(id: number | string, signal?: AbortSignal): Promise<StessaBankAccount | null> {
    const payload = await this.http.request("GET", `${ENDPOINT}/accounts/${id}`, { signal });
    const one = parseOne(payload);
    return one ? parseBankAccount(one) : null;
  }

  /** `GET /api/v2/banking/account_statement_lines`. */
  async statementLines(signal?: AbortSignal): Promise<unknown> {
    return this.http.request("GET", `${ENDPOINT}/account_statement_lines`, { signal });
  }
}
