import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { open, parseVaultKey, randomInviteCode, seal, sha256hex } from "../src/remote/crypto.js";
import { MemoryRemoteStore } from "../src/remote/store.js";
import { VaultOAuthProvider } from "../src/remote/oauthProvider.js";
import { sealTokenSet } from "../src/remote/vaultTokenProvider.js";

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
