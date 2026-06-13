# stessa-client-ts

Unofficial TypeScript toolkit for Stessa (rental-property accounting, owned by Roofstock), modelled on `tenantcloud-client-ts`. Stessa has no public API; this works against the internal `app.stessa.com/api` endpoints using a session borrowed from a browser.

## Decisions (made 2026-06-12)

- Monorepo with npm workspaces, two packages:
  - `packages/client` - `stessa-client`: API client, token stores, CDP auth (`stessa-client/cdp`)
  - `packages/mcp` - `stessa-mcp`: MCP server + CLI (`mcp`, `login`, `logout`, `install`, `serve`, `invite`)
- Ecosystem libs: `chrome-remote-interface` (CDP), `@napi-rs/keyring` (OS credential store), `@modelcontextprotocol/sdk`, `express`, `pg`, `zod`
- Node >= 20, ESM, TypeScript strict (incl. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), vitest, tsc (no bundler)
- TS-native types: `number` ids, `Date` dates, money flattened to `{cents, amount, currency}`

## Ground truth: Stessa internal API (discovered 2026-06-12 from the SPA bundle)

Full report in `docs/api-findings.md`; raw endpoint list in `docs/endpoints.txt`.

- **Base URL**: `https://app.stessa.com` (same origin serves the SPA and the API). `/api` (v1, only `token_from_session`) and `/api/v2` (everything else).
- **Auth**: Auth0 SPA SDK. Custom domain `auth.roofstock.com`, client id `lpXpR0vUTFsI0uxTfNe6m0MoTcKnf6em`, **no audience override** (default-audience token). The app sends `Authorization: Bearer <auth0 access token>` and `withCredentials: true` (cookies). A logged-in session exchanges for a fresh bearer via `GET /api/token_from_session`.
- **Response envelopes**:
  - Core `/api/v2/*`: `{ data: ... }`. Collections are a bare array or a nested named array (`data.portfolios`, `data.documents`, ...). Pagination is custom: `{ page, per_page, total_pages }`. Filters use Spatie bracket syntax `filter[...]`; sort is `sort[column]`/`sort[direction]`; scope is `portfolio_id`/`property_id`/`unit_id`.
  - Banking `/api/v2/banking/*` (proxied from Unit): JSON:API, `{ data: { id, type, attributes } }`.
- **Money**: always `{ cents, currency_iso }`.
- **Errors**: non-500 carry `response.data.error.detail`; 401 means the session is gone. No CSRF header; no `X-Requested-With`. Path-based versioning.
- **~110 endpoints, 100 with a confirmed verb.** 10 are dispatched indirectly and left method-undetermined (not guessed).

## Architecture (TS)

### packages/client
- `json.ts` - `toNumber`/`parseMoney`/`parseStessaDate*`/`pick` (case-insensitive, snake/camel tolerant)
- `models.ts` - Property, Portfolio, Transaction, BankAccount, Document, Tenancy + best-effort parsers (keep `raw`)
- `errors.ts` - `StessaClientError` (httpStatus; message from `error.detail`)
- `auth.ts` - `StessaTokenSet { accessToken, sessionCookie }`, provider/store interfaces, `StaticTokenProvider`
- `resources/envelope.ts` - `parseList`/`parseOne`/`flattenItem`, `withQuery`, `ResourceClient` (generic CRUD over any endpoint)
- `resources/{properties,portfolios,banking,documents,transactions,tenancies}.ts` - typed sub-clients
- `stessaClient.ts` - fetch-based client; `{data}` handling, 401 refresh-and-retry-once, `request()`, `resource()`, sub-clients
- `cdp/` - `jwt.ts` (exp decode), `refresher.ts` (`exchangeSessionForToken` via `token_from_session`), `chromiumFinder.ts`, `cdpTokenProvider.ts` (cache -> store(+exchange) -> CDP cookie capture -> interactive Auth0 login)
- `store/` - `FileTokenStore` (atomic JSON), `SecureTokenStore` (`@napi-rs/keyring`, service `stessa-client`)

### packages/mcp
- `server.ts` - 13 tools + `stessa_request` escape hatch + resources; `runServer` (stdio)
- `entityCache.ts` / `entityEnricher.ts` - property/portfolio id->name resolution
- `catalog.ts` / `guide.ts` - `stessa://catalog` and `stessa://guide` resources
- `cli.ts` + `authCommands.ts` + `installCommand.ts` - `mcp|login|logout|install|serve|invite`
- `remote/` - hosted multi-user server: Streamable HTTP `/mcp` behind OAuth 2.1 (`mcpAuthRouter` + `VaultOAuthProvider`: DCR, PKCE, opaque tokens hashed at rest; login page = email + admin invite code). Per-user **Stessa session cookie** in an AES-256-GCM vault (`STESSA_VAULT_KEY`) on Postgres (`PgRemoteStore`; `MemoryRemoteStore` for dev). `VaultTokenProvider` mints a bearer from the stored cookie per user, serialized; daily keep-alive. Pairing: admin `invite` -> teammate `login --remote` (local Auth0 login captures the session, POST /pair). Offboarding: POST /admin/revoke. Deploy: `railway.json` + `docs/DEPLOY_RAILWAY.md`.

## Status

- [x] Repo scaffold; json/money helpers + models; envelope parsers + StessaClient
- [x] client: typed sub-clients + generic `resource()` + token stores + CDP auth
- [x] mcp: 13 tools + `stessa_request` + `stessa://guide`/`stessa://catalog`; CLI; hosted server
- [x] tests green (35); build green; `serve` boots and answers `/healthz` + OAuth metadata + admin invite
- [ ] **NOT yet verified live** (no test account): exact `token_from_session` response shape; the Stessa session cookie name; per-endpoint field names; whether `/api/v2` accepts the bearer without the cookie. The `stessa_request` escape hatch + `stessa://catalog` cover the gap until verified.
- [ ] writes beyond `stessa_request` (typed create/update for transactions, tenancies); banking flows
- [ ] npm publish (later)

## Auth design note (Stessa vs TenantCloud)

TenantCloud exposes a refresh-token grant, so its vault stores `{accessToken, refreshToken, fingerprint}`. Stessa's Auth0 SPA keeps the bearer in memory only and refreshes via a session cookie, so here the durable secret is the **session cookie** and "refresh" is `GET /api/token_from_session`. Everything downstream (vault, keep-alive, 401 retry) follows the same shape.
