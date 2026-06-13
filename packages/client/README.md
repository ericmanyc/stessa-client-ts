# stessa-client

Unofficial TypeScript client for [Stessa](https://www.stessa.com) (rental-property accounting). Works against Stessa's internal `app.stessa.com/api` endpoints; **not an official Stessa product** and can break when their frontend changes.

```bash
npm install stessa-client
```

```ts
import { StessaClient, SecureTokenStore } from "stessa-client";
import { CdpTokenProvider } from "stessa-client/cdp";

const tc = new StessaClient(
  new CdpTokenProvider({ tokenStore: new SecureTokenStore(), allowInteractiveLogin: true }),
);

const portfolios = await tc.portfolios.list();
const properties = await tc.properties.list();
const accounts = await tc.banking.accounts();
const summary = await tc.request("GET", "/api/v2/summary"); // any endpoint
```

## What's here

- Typed sub-clients: `properties`, `portfolios`, `banking`, `documents`, `transactions`, `tenancies`
- `request(method, path, opts)` and `resource(endpoint)` for any endpoint in the catalog
- `{ data }` and JSON:API envelope parsing; money flattened to `{ cents, amount, currency }`
- Token stores: `SecureTokenStore` (OS credential store), `FileTokenStore`
- `stessa-client/cdp`: `CdpTokenProvider` - captures a Stessa session from a running/temporary Chromium and mints bearers via `GET /api/token_from_session`

See the [repo README](https://github.com/ericmanyc/stessa-client-ts) and `docs/api-findings.md` for the full API surface and the live-verification caveats.

## License

MIT
