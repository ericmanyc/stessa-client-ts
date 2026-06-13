import type { StessaTokenSet } from "../auth.js";

/**
 * Mints a fresh Stessa bearer from a session cookie via
 * `GET /api/token_from_session`. This is the app's own session->token exchange:
 * a valid Stessa session cookie returns a short-lived Auth0 access token.
 *
 * The response shape was not verified live; this accepts a bare token string or
 * common JSON wrappers (`{ token }`, `{ access_token }`, `{ data: { token } }`).
 * Returns the new token set (cookie carried over), or null on any failure.
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

function extractToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  // A bare JWT (three dot-separated segments) returned as text/plain.
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const body = JSON.parse(trimmed) as Record<string, unknown>;
    const candidate =
      body["token"] ??
      body["access_token"] ??
      body["accessToken"] ??
      (body["data"] as Record<string, unknown> | undefined)?.["token"] ??
      (body["data"] as Record<string, unknown> | undefined)?.["access_token"];
    return typeof candidate === "string" && candidate ? candidate : null;
  } catch {
    return null;
  }
}
