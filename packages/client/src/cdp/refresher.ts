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
    // If Stessa rotates or extends the session (Set-Cookie), keep the new
    // values; otherwise the stored cookie silently ages out.
    const sessionCookie = mergeSetCookies(current.sessionCookie, response.headers.getSetCookie());
    return { accessToken, sessionCookie };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return null;
  }
}

/**
 * Apply Set-Cookie response headers to a `Cookie` request header value:
 * updated names are replaced, new names appended, and cookies the server
 * deletes (empty value, Max-Age<=0, or an Expires in the past) are dropped.
 */
export function mergeSetCookies(cookieHeader: string, setCookies: readonly string[]): string {
  const jar = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  for (const header of setCookies) {
    const [pair = "", ...attrs] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const deleted =
      value === "" ||
      attrs.some((a) => {
        const [k = "", v = ""] = a.split("=").map((x) => x.trim());
        if (k.toLowerCase() === "max-age") return Number(v) <= 0;
        if (k.toLowerCase() === "expires") return Date.parse(v) < Date.now();
        return false;
      });
    if (deleted) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
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
