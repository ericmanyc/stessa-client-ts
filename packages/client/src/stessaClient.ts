import type { StessaAuthTokenProvider } from "./auth.js";
import { StessaClientError } from "./errors.js";
import {
  ResourceClient,
  withQuery,
  type HttpMethod,
  type RequestOptions,
  type StessaHttp,
} from "./resources/envelope.js";
import { PropertiesClient } from "./resources/properties.js";
import { PortfoliosClient } from "./resources/portfolios.js";
import { BankingClient } from "./resources/banking.js";
import { DocumentsClient } from "./resources/documents.js";
import { TransactionsClient } from "./resources/transactions.js";
import { TenanciesClient } from "./resources/tenancies.js";

export interface StessaClientOptions {
  /** Stessa app base URL (same origin serves the API). */
  baseUrl?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof fetch;
}

const USER_AGENT = "stessa-client-ts/0.1";

/**
 * Client for Stessa's internal API. Built on a single authenticated `request()`
 * that handles the `{ data }` envelope, the 401 refresh-and-retry-once flow, and
 * Stessa's `response.data.error.detail` error contract.
 */
export class StessaClient implements StessaHttp {
  private readonly tokenProvider: StessaAuthTokenProvider;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  readonly properties: PropertiesClient;
  readonly portfolios: PortfoliosClient;
  readonly banking: BankingClient;
  readonly documents: DocumentsClient;
  readonly transactions: TransactionsClient;
  readonly tenancies: TenanciesClient;

  constructor(tokenProvider: StessaAuthTokenProvider, options: StessaClientOptions = {}) {
    this.tokenProvider = tokenProvider;
    this.baseUrl = (options.baseUrl ?? "https://app.stessa.com").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;

    this.properties = new PropertiesClient(this);
    this.portfolios = new PortfoliosClient(this);
    this.banking = new BankingClient(this);
    this.documents = new DocumentsClient(this);
    this.transactions = new TransactionsClient(this);
    this.tenancies = new TenanciesClient(this);
  }

  /**
   * The signed-in user / app context. Stessa has no `/me`; the sidebar app
   * endpoint carries the current user and account context.
   */
  async getUserInfo(signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    const payload = await this.request<Record<string, unknown>>("GET", "/api/v2/sidebar/app", {
      signal,
    });
    if (!payload || typeof payload !== "object") {
      return null;
    }
    const data = (payload as Record<string, unknown>)["data"];
    return (data && typeof data === "object" ? (data as Record<string, unknown>) : payload) ?? null;
  }

  /**
   * Low-level authenticated request. Handles the 401 refresh-and-retry-once
   * flow, JSON encoding/decoding, and error mapping. Paths are relative to the
   * app origin, e.g. "/api/v2/properties".
   *
   * @returns the parsed JSON body, or `null` for empty (204) responses.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const uri = withQuery(path.startsWith("/") ? path : `/${path}`, options.query);
    const response = await this.send(method, uri, options.body, options.signal);
    return (await this.parse(response)) as T;
  }

  /** Generic accessor for any endpoint in the catalog without a typed client. */
  resource(endpoint: string): ResourceClient {
    return new ResourceClient(this, endpoint);
  }

  private async parse(response: Response): Promise<unknown> {
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      if (response.ok) {
        return null;
      }
    }

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch (cause) {
        if (response.ok) {
          throw new StessaClientError(response.status, "Invalid JSON response payload", { cause });
        }
        body = null;
      }
    }

    if (response.ok) {
      return body;
    }

    throw new StessaClientError(response.status, extractErrorMessage(body));
  }

  private async send(
    method: HttpMethod,
    uri: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const token = await this.tokenProvider.getToken(signal);
    if (!token) {
      throw new StessaClientError(401, "No auth token available");
    }

    const response = await this.fetchImpl(this.baseUrl + uri, this.buildInit(method, token, body, signal));
    if (response.status !== 401) {
      return response;
    }

    // Token was rejected: notify provider and try once more.
    await this.tokenProvider.onTokenRejected(token, signal);
    const newToken = await this.tokenProvider.getToken(signal);
    if (!newToken || newToken === token) {
      throw new StessaClientError(401, "Auth token rejected and no new token available");
    }

    return this.fetchImpl(this.baseUrl + uri, this.buildInit(method, newToken, body, signal));
  }

  private buildInit(
    method: HttpMethod,
    token: string,
    body: unknown,
    signal?: AbortSignal,
  ): RequestInit {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Cache-Control": "No-Cache",
      "User-Agent": USER_AGENT,
    };

    const init: RequestInit = { method, headers, signal: signal ?? null };
    if (body !== undefined && method !== "GET") {
      headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    return init;
  }
}

/** Stessa returns `{ error: { detail } }` on non-500 errors. */
function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error;
    if (error && typeof error === "object") {
      const detail = (error as { detail?: unknown }).detail;
      if (typeof detail === "string") {
        return detail;
      }
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Http error";
}
