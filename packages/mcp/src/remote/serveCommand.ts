import { parseVaultKey } from "./crypto.js";
import { createRemoteApp } from "./httpServer.js";
import { MemoryRemoteStore, type RemoteStore } from "./store.js";
import { PgRemoteStore } from "./pgStore.js";
import { VaultTokenProvider } from "./vaultTokenProvider.js";
import { setSignInHint } from "../tools/helpers.js";

const DEFAULT_KEEPALIVE_MINUTES = 60;

/**
 * `stessa-mcp serve` - run the hosted multi-user server (Railway etc.).
 *
 * Environment:
 *   PORT              - listen port (Railway injects this). Default 3000.
 *   BASE_URL          - public https URL of the deployment (required: OAuth issuer)
 *   STESSA_VAULT_KEY  - 64 hex chars; encrypts the credential vault (required)
 *   STESSA_ADMIN_KEY  - bearer key for /admin/* endpoints (required)
 *   KEEPALIVE_INTERVAL_MINUTES - how often to ping Stessa with each paired
 *                       user's session so idle sessions don't expire. Default 60.
 *   DATABASE_URL      - Postgres connection string. Omitted -> in-memory store
 *                       (every restart loses pairings; only for trying it out).
 */
export async function serve(): Promise<number> {
  const baseUrl = process.env["BASE_URL"];
  const vaultKeyHex = process.env["STESSA_VAULT_KEY"];
  const adminKey = process.env["STESSA_ADMIN_KEY"];
  const port = Number(process.env["PORT"] ?? 3000);

  if (!baseUrl || !vaultKeyHex || !adminKey) {
    console.error("Error: BASE_URL, STESSA_VAULT_KEY and STESSA_ADMIN_KEY must be set.");
    console.error("Generate a vault key with: openssl rand -hex 32");
    return 1;
  }

  const vaultKey = parseVaultKey(vaultKeyHex);

  let store: RemoteStore;
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl) {
    store = await PgRemoteStore.connect(databaseUrl);
    console.error("Connected to Postgres.");
  } else {
    store = new MemoryRemoteStore();
    console.error(
      "WARNING: DATABASE_URL not set - using in-memory storage. Pairings are lost on restart.",
    );
  }

  setSignInHint(
    "Their Stessa connection is missing or expired. They need to re-pair: " +
      'run "npx stessa-mcp login --remote <server-url> --email <their email> --code <their invite code>" on their computer, then retry.',
  );

  const app = createRemoteApp({ store, vaultKey, baseUrl, adminKey });
  app.listen(port, () => {
    console.error(`stessa-mcp remote server listening on :${port} (${baseUrl})`);
  });

  // Keep-alive: ping Stessa with each paired user's session cookie on a
  // fixed cadence (and once at boot, since every redeploy resets the timer) so
  // sessions stay warm even when nobody is using the connector.
  const minutes = Number(process.env["KEEPALIVE_INTERVAL_MINUTES"] ?? DEFAULT_KEEPALIVE_MINUTES);
  const intervalMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_KEEPALIVE_MINUTES) * 60_000;
  let running = false;
  const keepalive = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const userIds = await store.listVaultUserIds();
      let ok = 0;
      for (const userId of userIds) {
        const provider = new VaultTokenProvider(userId, store, vaultKey);
        const alive = await provider.keepAlive(AbortSignal.timeout(30_000)).catch(() => false);
        if (alive) {
          ok++;
        } else {
          console.error(`keepalive: user ${userId} FAILED (session rejected or unreachable; may need re-pair)`);
        }
      }
      console.error(`keepalive: ${ok}/${userIds.length} sessions ok`);
    } catch (error) {
      console.error("keepalive error:", error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
    }
  };
  void keepalive();
  setInterval(() => {
    void keepalive();
  }, intervalMs).unref();
  console.error(`keepalive: every ${intervalMs / 60_000} min`);

  return new Promise<number>(() => {});
}
