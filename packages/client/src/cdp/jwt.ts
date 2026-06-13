/**
 * Decodes a JWT payload (without signature verification) and reads the "exp"
 * claim. Stessa bearers are Auth0 access tokens. Returns null if malformed.
 */
export function getJwtExpiry(token: string | null | undefined): Date | null {
  if (!token) {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }

    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(payload) as Record<string, unknown>;
    const exp = claims["exp"];
    if (typeof exp !== "number") {
      return null;
    }

    return new Date(exp * 1000);
  } catch {
    return null;
  }
}

/** True when the token expires within the next 60 seconds (or is malformed). */
export function isExpiredOrExpiring(token: string | null | undefined): boolean {
  const expiry = getJwtExpiry(token);
  if (expiry === null) {
    return true;
  }
  return expiry.getTime() < Date.now() + 60_000;
}

/**
 * Whether a token is good to use right now. Stessa's API token (from
 * token_from_session) is **opaque** - it carries no expiry we can read - and the
 * durable credential is the session cookie, so an opaque token is treated as
 * usable and refreshed reactively on a 401. JWTs still use their `exp` claim.
 */
export function isUsableToken(token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }
  const expiry = getJwtExpiry(token);
  if (expiry === null) {
    return true; // opaque token: assume usable; a 401 triggers a re-mint
  }
  return expiry.getTime() >= Date.now() + 60_000;
}
