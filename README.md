# stessa-client-ts

TypeScript client library and MCP server for [Stessa](https://www.stessa.com), a rental-property accounting platform (owned by Roofstock). Built in the same shape as [tenantcloud-client-ts](https://github.com/ericmanyc/tenantcloud-client-ts).

> **This is not an official Stessa product.** Stessa does not publish a public API; this library works against their internal `app.stessa.com/api` endpoints, reverse-engineered from the web app's compiled bundle (see [docs/api-findings.md](docs/api-findings.md)). It can break whenever Stessa changes their frontend. Use at your own risk.
>
> **Live-verification status:** endpoints and field names were discovered statically from the SPA bundle and are exercised here against mocked responses, not yet confirmed against a live account. Treat field names as best-effort; the `stessa_request` escape hatch and `stessa://catalog` resource give you the full surface to verify against your own data.

## Packages

| Package | Description |
|---------|-------------|
| [`packages/client`](packages/client) | `stessa-client`: typed API client (properties, portfolios, banking, documents, transactions, tenancies), `{data}`/JSON:API envelope handling, money (`{cents, currency_iso}`) parsing, token stores, CDP browser auth |
| [`packages/mcp`](packages/mcp) | `stessa-mcp`: MCP server (stdio) exposing Stessa to AI agents, plus a `login`/`logout`/`install`/`serve` CLI and a hosted multi-user server |

## Quick start

### MCP server (local)

```bash
npx stessa-mcp install claude-code   # or: claude-desktop
```

Restart Claude Code and ask things like "what's my portfolio equity?", "list my properties", or "show my bank account balances". The first time, the agent notices you are not signed in and offers to open a Stessa sign-in window (Auth0 login); the session is captured into your OS credential store. To sign in ahead of time: `npx stessa-mcp login`.

### Hosted server (Claude on web, teams)

`stessa-mcp serve` runs a multi-user remote server: OAuth 2.1 in front (claude.ai custom-connector flow, email + invite code), an encrypted per-user Stessa session vault in Postgres, and per-person pairing via `stessa-mcp login --remote`. Each teammate's tool calls run under their own Stessa account. Each company hosts its own instance (fork or clone this repo). Step-by-step Railway guide: [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md).

### Client library

```ts
import { StessaClient, SecureTokenStore } from "stessa-client";
import { CdpTokenProvider } from "stessa-client/cdp";

const tc = new StessaClient(
  new CdpTokenProvider({ tokenStore: new SecureTokenStore(), allowInteractiveLogin: true }),
);

const portfolios = await tc.portfolios.list();
const properties = await tc.properties.list({ scope: { portfolio_id: portfolios[0].id } });
const accounts = await tc.banking.accounts();

// Any other endpoint (see stessa://catalog):
const summary = await tc.request("GET", "/api/v2/summary");
```

## MCP tools

13 tools plus resources `stessa://guide`, `stessa://catalog`, `stessa://property/{id}`, `stessa://portfolio/{id}`:

- **Core reads**: `get_user`, `list_portfolios`, `get_summary`, `list_properties`, `get_property`, `list_bank_accounts`, `list_documents`, `list_tenancies`, `list_scheduled_incomes`
- **Financials**: `get_transactions_summary`, `list_transaction_categories`, `get_report_data`
- **Escape hatch**: `stessa_request` (any of the ~110 cataloged endpoints; see `stessa://catalog`)

Tool responses flatten money to `{cents, amount, currency}` and resolve property/portfolio IDs to names via an entity cache. Money-moving banking endpoints (transfers, card creation) are intentionally reachable only through `stessa_request`, so they are always explicit.

## How authentication works

Stessa uses Auth0 (custom domain `auth.roofstock.com`); the SPA holds a short-lived bearer in memory and a durable session cookie, and mints fresh bearers via `GET /api/token_from_session`. The CDP token provider:

1. Returns the in-memory bearer if its JWT is still valid
2. Loads from the token store; if the bearer is expiring, exchanges the stored session cookie for a new one
3. Connects to a running Chromium (debug port 9222), reads the `app.stessa.com` session cookie, and mints a bearer from it
4. If allowed, launches a temporary browser window for interactive Auth0 login, then captures the session

## Development

```bash
npm install
npm run build      # tsc --build for both packages
npm test           # vitest (client parsing + MCP server + remote OAuth)
```

See [SPEC.md](SPEC.md) for design decisions and [docs/api-findings.md](docs/api-findings.md) for the documented internal API surface.

## License

[MIT](LICENSE).
