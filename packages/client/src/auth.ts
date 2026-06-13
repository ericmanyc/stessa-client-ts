/**
 * Stessa authentication.
 *
 * Stessa's SPA authenticates with Auth0 (custom domain auth.roofstock.com) and
 * sends a short-lived Auth0 access token as `Authorization: Bearer <token>` on
 * every API call. The browser also holds a Stessa **session cookie** and can
 * mint a fresh bearer at any time via `GET /api/token_from_session`.
 *
 * So the durable credential we persist is the session cookie; the bearer is
 * derived from it on demand (see `cdp/refresher.ts`). A `StessaTokenSet` carries
 * both: the current bearer plus the cookie header used to refresh it.
 */
export interface StessaTokenSet {
  /** Auth0 access token (JWT) sent as the Bearer token. Short-lived. */
  accessToken: string;
  /**
   * Serialized Cookie header for app.stessa.com (e.g. "_stessa_session=...; ...").
   * Durable; replayed against /api/token_from_session to mint new bearers.
   */
  sessionCookie: string;
}

/** Provides Bearer tokens for Stessa API authentication. */
export interface StessaAuthTokenProvider {
  /** Returns a valid Bearer token, or null if no token is available. */
  getToken(signal?: AbortSignal): Promise<string | null>;

  /**
   * Called when the server returns 401 Unauthorized. The provider should
   * invalidate its cached token so the next getToken() attempts a refresh.
   * The rejected token is passed to avoid a race where two simultaneous
   * requests both receive 401.
   */
  onTokenRejected(rejectedToken: string, signal?: AbortSignal): Promise<void>;
}

/** Persists Stessa auth across sessions. */
export interface StessaTokenStore {
  load(signal?: AbortSignal): Promise<StessaTokenSet | null>;
  save(tokens: StessaTokenSet, signal?: AbortSignal): Promise<void>;
  delete(signal?: AbortSignal): Promise<void>;
}

/** A token provider that returns a fixed token. Once rejected, returns null. */
export class StaticTokenProvider implements StessaAuthTokenProvider {
  private token: string | null;

  constructor(token: string) {
    if (!token) {
      throw new Error("token is required");
    }
    this.token = token;
  }

  getToken(): Promise<string | null> {
    return Promise.resolve(this.token);
  }

  onTokenRejected(rejectedToken: string): Promise<void> {
    if (this.token === rejectedToken) {
      this.token = null;
    }
    return Promise.resolve();
  }
}
