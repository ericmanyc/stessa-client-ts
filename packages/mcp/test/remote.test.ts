import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { open, parseVaultKey, randomInviteCode, seal, sha256hex } from "../src/remote/crypto.js";
import { MemoryRemoteStore } from "../src/remote/store.js";
import { VaultOAuthProvider } from "../src/remote/oauthProvider.js";
import { VaultTokenProvider, sealTokenSet } from "../src/remote/vaultTokenProvider.js";

const VAULT_KEY = parseVaultKey(randomBytes(32).toString("hex"));

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

const testClient: OAuthClientInformationFull = {
  client_id: "client-1",
  redirect_uris: ["https://claude.ai/callback"],
  token_endpoint_auth_method: "none",
};

describe("vault crypto", () => {
  it("seals and opens round-trip", () => {
    const sealed = seal("hello session cookie", VAULT_KEY);
    expect(sealed).not.toContain("hello");
    expect(open(sealed, VAULT_KEY)).toBe("hello session cookie");
  });

  it("rejects a malformed vault key", () => {
    expect(() => parseVaultKey("too-short")).toThrow();
  });

  it("invite codes are XXXX-XXXX from an unambiguous alphabet", () => {
    expect(randomInviteCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("sealTokenSet stores only ciphertext but decrypts to the cookie", () => {
    const sealed = sealTokenSet({ accessToken: "", sessionCookie: "_stessa_session=abc" }, VAULT_KEY);
    expect(sealed).not.toContain("stessa_session");
    expect(JSON.parse(open(sealed, VAULT_KEY))).toEqual({
      accessToken: "",
      sessionCookie: "_stessa_session=abc",
    });
  });
});

describe("VaultOAuthProvider", () => {
  it("runs the full authorize-code -> token -> verify flow and rotates refresh tokens", async () => {
    const store = new MemoryRemoteStore();
    const provider = new VaultOAuthProvider(store);
    await store.saveClient(testClient);

    const inviteCode = randomInviteCode();
    await store.upsertUser("teammate@example.com", sha256hex(inviteCode));

    const { challenge } = pkcePair();
    const login = await provider.completeLogin({
      email: "teammate@example.com",
      inviteCode,
      clientId: testClient.client_id,
      redirectUri: testClient.redirect_uris[0]!,
      codeChallenge: challenge,
      state: "xyz",
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;

    const code = new URL(login.redirect).searchParams.get("code")!;
    expect(code).toBeTruthy();

    // The SDK checks the PKCE challenge out-of-band; we then exchange the code.
    expect(await provider.challengeForAuthorizationCode(testClient, code)).toBe(challenge);
    const tokens = await provider.exchangeAuthorizationCode(testClient, code);
    expect(tokens.access_token).toMatch(/^sta_/);
    expect(tokens.refresh_token).toMatch(/^str_/);

    const auth = await provider.verifyAccessToken(tokens.access_token);
    const userId = (auth.extra as { userId: number }).userId;
    expect(typeof userId).toBe("number");

    // Refresh rotates: the old refresh token is single-use.
    const refreshed = await provider.exchangeRefreshToken(testClient, tokens.refresh_token!);
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    await expect(provider.exchangeRefreshToken(testClient, tokens.refresh_token!)).rejects.toThrow();
  });

  it("rejects a wrong invite code", async () => {
    const store = new MemoryRemoteStore();
    const provider = new VaultOAuthProvider(store);
    await store.saveClient(testClient);
    await store.upsertUser("teammate@example.com", sha256hex(randomInviteCode()));

    const { challenge } = pkcePair();
    const login = await provider.completeLogin({
      email: "teammate@example.com",
      inviteCode: "WRON-GXXX",
      clientId: testClient.client_id,
      redirectUri: testClient.redirect_uris[0]!,
      codeChallenge: challenge,
      state: "",
    });
    expect(login.ok).toBe(false);
  });
});

describe("VaultTokenProvider keep-alive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup(fetchImpl: typeof fetch) {
    vi.stubGlobal("fetch", fetchImpl);
    const store = new MemoryRemoteStore();
    await store.saveVault(
      7,
      sealTokenSet({ accessToken: "opaque-old", sessionCookie: "_stessa_session=s1" }, VAULT_KEY),
    );
    const load = async () => JSON.parse(open((await store.loadVault(7))!, VAULT_KEY));
    return { store, load, make: () => new VaultTokenProvider(7, store, VAULT_KEY) };
  }

  it("keepAlive hits Stessa even when the stored opaque bearer looks usable, and saves rotated cookies", async () => {
    let calls = 0;
    const { make, load } = await setup((async () => {
      calls++;
      return new Response(JSON.stringify({ data: { auth_token: `opaque-${calls}` } }), {
        headers: [["Set-Cookie", "_stessa_session=s2; Path=/; HttpOnly"]],
      });
    }) as typeof fetch);
    const provider = make();
    expect(await provider.getToken()).toBe("opaque-old"); // served from vault, no network
    expect(calls).toBe(0);
    expect(await provider.keepAlive()).toBe(true);
    expect(calls).toBe(1);
    expect(await load()).toEqual({ accessToken: "opaque-1", sessionCookie: "_stessa_session=s2" });
  });

  it("keepAlive reports a rejected session without deleting the vault", async () => {
    const { make, store } = await setup((async () => new Response("", { status: 401 })) as typeof fetch);
    expect(await make().keepAlive()).toBe(false);
    expect(await store.loadVault(7)).not.toBeNull();
  });

  it("re-reads the vault instead of re-minting from a stale cached copy", async () => {
    let calls = 0;
    const { make, load } = await setup((async () => {
      calls++;
      return new Response(JSON.stringify({ data: { auth_token: `opaque-${calls}` } }));
    }) as typeof fetch);
    const a = make();
    const b = make();
    expect(await a.getToken()).toBe("opaque-old");
    await b.keepAlive(); // vault now holds opaque-1
    await a.onTokenRejected("opaque-old"); // a's cache is stale: adopt vault, no extra mint
    expect(calls).toBe(1);
    expect(await a.getToken()).toBe("opaque-1");
    expect((await load()).accessToken).toBe("opaque-1");
  });
});
