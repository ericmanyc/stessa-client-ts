import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import CDP from "chrome-remote-interface";
import type { StessaAuthTokenProvider, StessaTokenSet, StessaTokenStore } from "../auth.js";
import { findChromiumBrowsers } from "./chromiumFinder.js";
import { isExpiredOrExpiring } from "./jwt.js";
import { exchangeSessionForToken } from "./refresher.js";

export interface CdpTokenProviderOptions {
  /** CDP debug port to connect to an existing browser. Default 9222. */
  debugPort?: number;
  /** When true, the provider may launch a browser for interactive login. */
  allowInteractiveLogin?: boolean;
  /** Stessa web application URL (same origin serves the API). */
  appUrl?: string;
  /** Optional token store for persisting tokens across sessions. */
  tokenStore?: StessaTokenStore;
  /** Override automatic browser discovery with a specific executable path. */
  browserExecutablePath?: string;
  /** Timeout for the whole interactive login flow, in milliseconds. Default 5 minutes. */
  interactiveLoginTimeoutMs?: number;
}

interface CdpTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * Token provider that connects to a Chromium browser via Chrome DevTools
 * Protocol to obtain Stessa auth from an existing browser session.
 *
 * Stessa stores its Auth0 access token only in memory, so we don't read it from
 * localStorage like other apps. Instead we capture the durable session cookie
 * and exchange it for a fresh bearer via /api/token_from_session.
 *
 * Acquisition order: in-memory cache -> token store (refresh if expiring) ->
 * CDP extraction from a logged-in tab -> interactive login (if allowed).
 */
export class CdpTokenProvider implements StessaAuthTokenProvider {
  private readonly options: Required<
    Pick<
      CdpTokenProviderOptions,
      "debugPort" | "allowInteractiveLogin" | "appUrl" | "interactiveLoginTimeoutMs"
    >
  > &
    CdpTokenProviderOptions;

  private cached: StessaTokenSet | null = null;
  private browserProcess: ChildProcess | null = null;
  private gate: Promise<unknown> = Promise.resolve();

  constructor(options: CdpTokenProviderOptions = {}) {
    this.options = {
      debugPort: 9222,
      allowInteractiveLogin: false,
      appUrl: "https://app.stessa.com",
      interactiveLoginTimeoutMs: 5 * 60_000,
      ...options,
    };
  }

  getToken(signal?: AbortSignal): Promise<string | null> {
    return this.serialized(() => this.getTokenCore(signal));
  }

  /**
   * Run the interactive browser login flow now, regardless of
   * `allowInteractiveLogin`. Launches a temporary browser window, waits for the
   * user to finish signing in, then caches and persists the tokens. Returns null
   * if the user closed the window, it timed out, or no browser was found.
   */
  interactiveLogin(signal?: AbortSignal): Promise<StessaTokenSet | null> {
    return this.serialized(async () => {
      const tokens = await this.tryInteractiveLogin(signal);
      if (tokens) {
        this.cached = tokens;
        await this.persist(tokens);
      }
      return tokens;
    });
  }

  onTokenRejected(rejectedToken: string, signal?: AbortSignal): Promise<void> {
    return this.serialized(async () => {
      if (this.cached?.accessToken !== rejectedToken) {
        return;
      }
      try {
        const refreshed = await exchangeSessionForToken(this.cached, this.options.appUrl, signal);
        this.cached = refreshed;
        if (refreshed) {
          await this.persist(refreshed);
        }
      } catch {
        this.cached = null;
      }
    });
  }

  /** Serializes concurrent calls so refreshes never race. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.gate.then(fn, fn);
    this.gate = run.catch(() => {});
    return run;
  }

  private async getTokenCore(signal?: AbortSignal): Promise<string | null> {
    if (this.cached && !isExpiredOrExpiring(this.cached.accessToken)) {
      return this.cached.accessToken;
    }

    let tokens = await this.tryLoadAndRefreshFromStore(signal);
    if (tokens) {
      this.cached = tokens;
      return tokens.accessToken;
    }

    tokens = await this.tryExtractFromBrowser(this.options.debugPort, signal);
    if (tokens) {
      this.cached = tokens;
      await this.persist(tokens);
      return tokens.accessToken;
    }

    if (this.options.allowInteractiveLogin) {
      tokens = await this.tryInteractiveLogin(signal);
      if (tokens) {
        this.cached = tokens;
        await this.persist(tokens);
        return tokens.accessToken;
      }
    }

    return null;
  }

  private async tryLoadAndRefreshFromStore(signal?: AbortSignal): Promise<StessaTokenSet | null> {
    const store = this.options.tokenStore;
    if (!store) {
      return null;
    }

    try {
      const stored = await store.load(signal);
      if (!stored) {
        return null;
      }
      if (!isExpiredOrExpiring(stored.accessToken)) {
        return stored;
      }
      const refreshed = await exchangeSessionForToken(stored, this.options.appUrl, signal);
      if (refreshed) {
        await this.persist(refreshed);
      }
      return refreshed;
    } catch {
      return null;
    }
  }

  private async tryExtractFromBrowser(
    port: number,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    try {
      const target = await this.findTarget(port, true);
      if (!target) {
        return null;
      }
      return await this.extractTokensViaCdp(port, target, signal);
    } catch {
      return null;
    }
  }

  private async findTarget(port: number, requireAppUrl: boolean): Promise<CdpTarget | null> {
    let targets: CdpTarget[];
    try {
      targets = (await CDP.List({ port })) as CdpTarget[];
    } catch {
      return null;
    }

    const appHost = new URL(this.options.appUrl).host;

    for (const target of targets) {
      if (target.type !== "page" || !target.webSocketDebuggerUrl) {
        continue;
      }
      if (!requireAppUrl) {
        return target;
      }
      try {
        const host = new URL(target.url).host;
        if (host.toLowerCase().endsWith(appHost.toLowerCase())) {
          return target;
        }
      } catch {
        // Not a parsable URL (chrome:// etc.)
      }
    }

    return null;
  }

  private async extractTokensViaCdp(
    port: number,
    target: CdpTarget,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    const client = await CDP({ port, target: target.id });
    try {
      const sessionCookie = await this.extractCookieHeader(client);
      if (!sessionCookie) {
        return null;
      }

      // Prefer minting the bearer from inside the page (matches the app exactly);
      // fall back to a server-side exchange with the captured cookie.
      const inPage = await this.evaluateString(
        client,
        "fetch('/api/token_from_session',{credentials:'include'}).then(r=>r.text())",
        true,
      );
      const accessToken =
        normalizeBearer(inPage) ??
        (await exchangeSessionForToken({ accessToken: "", sessionCookie }, this.options.appUrl, signal))
          ?.accessToken ??
        null;

      if (!accessToken) {
        return null;
      }
      return { accessToken, sessionCookie };
    } finally {
      await client.close().catch(() => {});
    }
  }

  private async evaluateString(
    client: CDP.Client,
    expression: string,
    awaitPromise = false,
  ): Promise<string | null> {
    try {
      const result = await client.Runtime.evaluate({
        expression,
        returnByValue: true,
        awaitPromise,
      });
      if (
        result.exceptionDetails ||
        result.result?.value === undefined ||
        result.result.value === null
      ) {
        return null;
      }
      return String(result.result.value);
    } catch {
      return null;
    }
  }

  private async extractCookieHeader(client: CDP.Client): Promise<string | null> {
    try {
      const { cookies } = await client.Network.getCookies({ urls: [this.options.appUrl] });
      const header = cookies
        .filter((c) => c.name && c.value)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      return header || null;
    } catch {
      return null;
    }
  }

  private async tryInteractiveLogin(signal?: AbortSignal): Promise<StessaTokenSet | null> {
    const browserPath = await this.resolveBrowserPath();
    if (!browserPath) {
      return null;
    }

    const port = 10_000 + Math.floor(Math.random() * 50_000);
    const tempProfile = join(tmpdir(), `stessa-cdp-${port}`);

    try {
      return await this.launchBrowserAndExtractTokens(browserPath, port, tempProfile, signal);
    } catch {
      return null;
    } finally {
      this.killBrowserProcess();
      await rm(tempProfile, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async resolveBrowserPath(): Promise<string | null> {
    if (this.options.browserExecutablePath) {
      return this.options.browserExecutablePath;
    }
    const browsers = await findChromiumBrowsers();
    return browsers[0]?.executablePath ?? null;
  }

  private async launchBrowserAndExtractTokens(
    browserPath: string,
    port: number,
    tempProfile: string,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    await mkdir(tempProfile, { recursive: true });

    const loginUrl = `${this.options.appUrl.replace(/\/+$/, "")}/login`;

    this.browserProcess = spawn(
      browserPath,
      [
        `--remote-debugging-port=${port}`,
        `--app=${loginUrl}`,
        `--user-data-dir=${tempProfile}`,
        "--no-first-run",
        "--disable-extensions",
      ],
      { stdio: "ignore" },
    );

    await delay(2000, undefined, { signal });

    return this.pollForLoginCompletion(port, signal);
  }

  private async pollForLoginCompletion(
    port: number,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    const deadline = Date.now() + this.options.interactiveLoginTimeoutMs;

    while (Date.now() < deadline) {
      if (signal?.aborted || this.browserProcess?.exitCode !== null) {
        return null;
      }

      try {
        await delay(1500, undefined, { signal });
      } catch {
        return null;
      }

      try {
        const tokens = await this.tryExtractAfterLogin(port, signal);
        if (tokens) {
          return tokens;
        }
      } catch {
        // CDP not ready yet, keep polling
      }
    }

    return null;
  }

  private async tryExtractAfterLogin(
    port: number,
    signal?: AbortSignal,
  ): Promise<StessaTokenSet | null> {
    const target = await this.findTarget(port, false);
    if (!target) {
      return null;
    }

    const client = await CDP({ port, target: target.id });
    let currentUrl: string | null;
    try {
      currentUrl = await this.evaluateString(client, "window.location.href");
    } finally {
      await client.close().catch(() => {});
    }

    if (!currentUrl) {
      return null;
    }

    // Still on a login / Auth0 / sign-in page; keep waiting.
    const lower = currentUrl.toLowerCase();
    if (lower.includes("/login") || lower.includes("/signin") || lower.includes("auth0")) {
      return null;
    }

    return this.extractTokensViaCdp(port, target, signal);
  }

  private async persist(tokens: StessaTokenSet): Promise<void> {
    try {
      await this.options.tokenStore?.save(tokens);
    } catch {
      // Persistence failure is non-fatal
    }
  }

  private killBrowserProcess(): void {
    try {
      if (this.browserProcess && this.browserProcess.exitCode === null) {
        this.browserProcess.kill();
      }
    } catch {
      // Best effort
    } finally {
      this.browserProcess = null;
    }
  }

  dispose(): void {
    this.killBrowserProcess();
  }
}

/** Accept either a bare JWT or a JSON wrapper from token_from_session. */
function normalizeBearer(text: string | null): string | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const body = JSON.parse(trimmed) as Record<string, unknown>;
    const candidate =
      body["token"] ?? body["access_token"] ?? body["accessToken"];
    return typeof candidate === "string" && candidate ? candidate : null;
  } catch {
    return null;
  }
}
