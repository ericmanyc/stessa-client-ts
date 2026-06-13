#!/usr/bin/env node
/**
 * Live read-only smoke test against a real Stessa account.
 *
 * Stessa's API is reverse-engineered and not yet verified live, so this script
 * exists to do that verification once you have a session. It performs only GET
 * requests and prints a per-method OK/FAIL summary.
 *
 * Provide auth one of two ways:
 *   STESSA_BEARER=<auth0 access token>   (grab from devtools on app.stessa.com)
 *   STESSA_COOKIE="<full cookie header>" (will be exchanged via token_from_session)
 *
 *   node scripts/smoke.mjs
 *
 * Build first: npm run build
 */
import { StessaClient, StaticTokenProvider } from "../packages/client/dist/index.js";
import { exchangeSessionForToken } from "../packages/client/dist/cdp/index.js";

const APP_URL = "https://app.stessa.com";

async function resolveToken() {
  if (process.env.STESSA_BEARER) {
    return process.env.STESSA_BEARER;
  }
  if (process.env.STESSA_COOKIE) {
    const set = await exchangeSessionForToken(
      { accessToken: "", sessionCookie: process.env.STESSA_COOKIE },
      APP_URL,
    );
    if (!set) {
      throw new Error("token_from_session exchange failed - is the cookie valid?");
    }
    return set.accessToken;
  }
  throw new Error("Set STESSA_BEARER or STESSA_COOKIE. See the header of this file.");
}

async function run(label, fn) {
  try {
    const result = await fn();
    const count = Array.isArray(result) ? result.length : result ? 1 : 0;
    console.log(`OK   ${label} (${count})`);
    return true;
  } catch (error) {
    console.log(`FAIL ${label}: ${error?.message ?? error}`);
    return false;
  }
}

const token = await resolveToken();
const tc = new StessaClient(new StaticTokenProvider(token));

let ok = 0;
let total = 0;
for (const [label, fn] of [
  ["getUserInfo", () => tc.getUserInfo()],
  ["portfolios.list", () => tc.portfolios.list()],
  ["portfolios.summary", () => tc.portfolios.summary()],
  ["properties.list", () => tc.properties.list()],
  ["banking.accounts", () => tc.banking.accounts()],
  ["documents.list", () => tc.documents.list()],
  ["tenancies.list", () => tc.tenancies.list()],
  ["transactions.categories", () => tc.transactions.categories()],
  ["transactions.summary", () => tc.transactions.summary()],
]) {
  total += 1;
  if (await run(label, fn)) ok += 1;
}

console.log(`\n${ok}/${total} methods OK`);
process.exit(ok === total ? 0 : 1);
