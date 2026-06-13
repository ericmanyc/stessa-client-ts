import { describe, expect, it } from "vitest";
import { extractToken } from "../src/cdp/refresher.js";
import { isUsableToken } from "../src/cdp/jwt.js";

describe("extractToken (token_from_session parsing)", () => {
  it("reads the live web3 shape { data: { auth_token } }", () => {
    const body = JSON.stringify({
      data: { auth_token: "FAKE_TEST_TOKEN_abc123", user: { id: 1, name: "Test User" } },
    });
    expect(extractToken(body)).toBe("FAKE_TEST_TOKEN_abc123");
  });

  it("returns null for the logged-out response", () => {
    expect(extractToken(JSON.stringify({ data: {}, message: "You are not logged in!" }))).toBeNull();
  });

  it("accepts a bare token line and common wrappers", () => {
    expect(extractToken("opaqueTokenValue")).toBe("opaqueTokenValue");
    expect(extractToken(JSON.stringify({ token: "abc" }))).toBe("abc");
    expect(extractToken(JSON.stringify({ access_token: "xyz" }))).toBe("xyz");
  });

  it("returns null for blank / unparseable input", () => {
    expect(extractToken("")).toBeNull();
    expect(extractToken("{not json")).toBeNull();
  });
});

describe("isUsableToken (opaque tokens have no readable expiry)", () => {
  it("treats a present opaque token as usable", () => {
    expect(isUsableToken("FAKE_TEST_TOKEN_abc123")).toBe(true);
  });
  it("treats an empty token as unusable", () => {
    expect(isUsableToken("")).toBe(false);
    expect(isUsableToken(null)).toBe(false);
  });
  it("honors a JWT exp claim", () => {
    const past = Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url");
    expect(isUsableToken(`h.${past}.s`)).toBe(false);
    const future = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
      "base64url",
    );
    expect(isUsableToken(`h.${future}.s`)).toBe(true);
  });
});
