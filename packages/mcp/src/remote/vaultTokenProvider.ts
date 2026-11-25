import type { StessaAuthTokenProvider, StessaTokenSet } from "stessa-client";
import { exchangeSessionForToken, isUsableToken } from "stessa-client/cdp";
import { open, seal } from "./crypto.js";
import type { RemoteStore } from "./store.js";

const APP_URL = "https://app.stessa.com";

/**
 * Per-user token gates, shared across provider instances. Mints for the same
 * user run strictly one at a time, even across several MCP sessions, so the
 * cached bearer and vault writes never race.
 */
const userGates = new Map<number, Promise<unknown>>();

function serialized<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const gate = userGates.get(userId) ?? Promise.resolve();
  const run = gate.then(fn, fn);
  userGates.set(
    userId,
    run.catch(() => {}),
  );
  return run;
}

/**
 * Token provider backed by the encrypted server-side vault. The vault holds the
 * teammate's durable Stessa **session cookie**; each getToken() mints a fresh
 * Auth0 bearer from it via /api/token_from_session. Strategy: in-memory cache
 * (if still valid) -> vault load -> exchange -> PERSIST the refreshed bearer ->
 * serve. A failed exchange returns null, surfacing as the "not signed in" tool
 * error (which tells the teammate to re-pair).
 */
export class VaultTokenProvider implements StessaAuthTokenProvider {
  private cached: StessaTokenSet | null = null;

  constructor(
    private readonly userId: number,
    private readonly store: RemoteStore,
    private readonly vaultKey: Buffer,
  ) {}

  getToken(signal?: AbortSignal): Promise<string | null> {
    return serialized(this.userId, async () => {
      if (this.cached && isUsableToken(this.cached.accessToken)) {
        return this.cached.accessToken;
      }

      // The vault is the source of truth: another provider instance (another
      // MCP session, or the keep-alive) may have refreshed since we cached.
      const stored = await this.loadFromVault();
      if (!stored) {
        this.cached = null;
        return null;
      }

      if (isUsableToken(stored.accessToken)) {
        this.cached = stored;
        return stored.accessToken;
      }

      return (await this.mint(stored, signal))?.accessToken ?? null;
    });
  }

  onTokenRejected(rejectedToken: string, signal?: AbortSignal): Promise<void> {
    return serialized(this.userId, async () => {
      if (this.cached?.accessToken !== rejectedToken) {
        return;
      }
      const stored = await this.loadFromVault();
      if (stored && stored.accessToken !== rejectedToken) {
        this.cached = stored; // someone else already re-minted
        return;
      }
      await this.mint(stored, signal);
    });
  }

  /**
   * Force a round trip to Stessa with the stored session cookie, even when the
   * cached bearer looks usable. This is what actually keeps an idle session
   * alive (an opaque bearer is otherwise served from the vault without ever
   * touching Stessa). Returns whether the session is still valid.
   */
  keepAlive(signal?: AbortSignal): Promise<boolean> {
    return serialized(this.userId, async () => {
      const stored = await this.loadFromVault();
      return (await this.mint(stored, signal)) !== null;
    });
  }

  private async mint(
    stored: StessaTokenSet | null,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    const refreshed = stored ? await exchangeSessionForToken(stored, APP_URL, signal) : null;
    if (refreshed) {
      await this.persist(refreshed);
    }
    this.cached = refreshed;
    return refreshed;
  }

  private async loadFromVault(): Promise<StessaTokenSet | null> {
    const sealed = await this.store.loadVault(this.userId);
    if (!sealed) {
      return null;
    }
    try {
      const parsed = JSON.parse(open(sealed, this.vaultKey)) as StessaTokenSet;
      return parsed.sessionCookie ? parsed : null;
    } catch {
      return null; // wrong key or corrupted row; treat as not paired
    }
  }

  private persist(tokens: StessaTokenSet): Promise<void> {
    return this.store.saveVault(this.userId, seal(JSON.stringify(tokens), this.vaultKey));
  }
}

/** Encrypt and store a freshly paired token set for a user. */
export function sealTokenSet(tokens: StessaTokenSet, vaultKey: Buffer): string {
  return seal(JSON.stringify(tokens), vaultKey);
}
