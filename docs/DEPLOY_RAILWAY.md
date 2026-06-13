# Deploying the hosted Stessa MCP server to Railway

This runs `stessa-mcp serve`: a multi-user MCP server behind OAuth 2.1, so
teammates can add it as a custom connector in Claude (web/desktop) and each acts
under their own Stessa account. Each company hosts its own instance.

## What you get

- `https://<your-app>.up.railway.app/mcp` - the MCP endpoint (add this in Claude)
- OAuth 2.1 in front (dynamic client registration, PKCE, an email + invite-code
  login page)
- An encrypted per-user vault (AES-256-GCM) holding each teammate's Stessa
  session, stored in Railway Postgres

## Prerequisites

- A Railway account and the CLI: `npm i -g @railway/cli` then `railway login`
- This repo (fork or clone)

## 1. Create the project and Postgres

```bash
railway init                     # create a new project
railway add --database postgres  # provision managed Postgres (sets DATABASE_URL)
```

## 2. Set environment variables

```bash
# 32-byte vault key (KEEP SECRET - losing it makes every pairing unreadable)
railway variables --set "STESSA_VAULT_KEY=$(openssl rand -hex 32)"
# Admin key for invite/revoke endpoints
railway variables --set "STESSA_ADMIN_KEY=$(openssl rand -hex 24)"
# Public URL of THIS deployment (the OAuth issuer). Set after the domain exists
# (step 3); it must exactly match the https URL Claude will hit.
railway variables --set "BASE_URL=https://<your-app>.up.railway.app"
```

`PORT` and `DATABASE_URL` are injected by Railway - do not set them yourself.

## 3. Deploy

```bash
railway up           # builds via railway.json (npm install && npm run build)
railway domain       # generate a public domain, then set BASE_URL to it and redeploy
```

`railway.json` already pins the start command (`node packages/mcp/dist/cli.js serve`)
and a `/healthz` health check.

## 4. Invite a teammate

```bash
# from your machine, with the admin key:
npx stessa-mcp invite teammate@example.com \
  --server https://<your-app>.up.railway.app \
  --admin-key <STESSA_ADMIN_KEY>
```

That prints a one-time invite code and the two steps to send them:

1. **Add the connector in Claude** -> `https://<your-app>.up.railway.app/mcp`,
   sign in with their email + invite code.
2. **Pair their Stessa account once, on their computer:**
   ```bash
   npx stessa-mcp login --remote https://<your-app>.up.railway.app \
     --email teammate@example.com --code XXXX-XXXX
   ```
   This opens a local browser for the Stessa (Auth0) sign-in and uploads the
   captured session to the vault. Nothing but the encrypted session is stored.

## 5. Offboard

```bash
curl -X POST https://<your-app>.up.railway.app/admin/revoke \
  -H "Authorization: Bearer <STESSA_ADMIN_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"teammate@example.com"}'
```

Deletes their vault entry and rotates their invite code.

## Notes and caveats

- **Single instance only.** Per-user session mints are serialized in-process; do
  not scale to multiple replicas.
- **Session lifetime is unverified.** Stessa bearers are short-lived and minted
  from the session cookie via `GET /api/token_from_session`; a daily keep-alive
  keeps each user's session warm. How long an idle Stessa session stays valid -
  and whether Stessa tolerates many sessions minting from one datacenter IP - has
  not been tested at scale. If a teammate's tools start returning "not signed
  in", they re-run the `login --remote` pairing step.
- **Vault key.** Back up `STESSA_VAULT_KEY`. Rotating it invalidates all
  pairings (everyone re-pairs).
- This is unofficial software against Stessa's internal API; it can break when
  Stessa changes their frontend.
