import type { StessaTokenSet } from "../auth.js";

/**
 * Mints a fresh Stessa bearer from a session cookie via
 * `GET /api/token_from_session`. This is the app's own session->token exchange:
 * a valid Stessa session cookie returns an API token sent as `Bearer <token>`.
 *
 * Verified live (web3 app): the response is
 * `{ data: { auth_token: "<opaque>", user: {...} } }`. The token is opaque (not
 * a JWT). This also tolerates a few alternate shapes. Returns the new token set
 * (cookie carried over), or null on any failure.
 */
export async function exchangeSessionForToken(
  current: StessaTokenSet,
  appUrl: string,
  signal?: AbortSignal,
): Promise<StessaTokenSet | null> {
  if (!current.sessionCookie) {
    return null;
  }
  try {
    const response = await fetch(`${appUrl.replace(/\/+$/, "")}/api/token_from_session`, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "No-Cache",
        Cookie: current.sessionCookie,
      },
      signal: signal ?? null,
    });

    if (!response.ok) {
      return null;
    }

    const accessToken = extractToken(await response.text());
    if (!accessToken) {
      return null;
    }
    return { accessToken, sessionCookie: current.sessionCookie };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return null;
  }
}

/**
 * Pull the API token out of a token_from_session response. Confirmed shape is
 * `{ data: { auth_token } }`; also accepts a bare token line and a few common
 * wrappers. The token may be opaque (no JWT structure).
 */
export function extractToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    // A bare token returned as text/plain.
    return trimmed;
  }
  try {
    const body = JSON.parse(trimmed) as Record<string, unknown>;
    const data = (body["data"] as Record<string, unknown> | undefined) ?? {};
    const candidate =
      data["auth_token"] ??
      body["auth_token"] ??
      body["token"] ??
      body["access_token"] ??
      body["accessToken"] ??
      data["token"] ??
      data["access_token"];
    return typeof candidate === "string" && candidate ? candidate : null;
  } catch {
    return null;
  }
}
