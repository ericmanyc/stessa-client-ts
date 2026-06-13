# stessa-mcp

MCP server exposing [Stessa](https://www.stessa.com) to AI agents (Claude Desktop, Claude Code, Cursor). **Unofficial**, works against Stessa's internal API.

```bash
npx stessa-mcp install claude-code     # or: claude-desktop
```

Then restart your client and ask about portfolios, properties, balances, and reports. First use opens a Stessa (Auth0) sign-in window; the session goes to your OS credential store. Sign in ahead of time with `npx stessa-mcp login`.

## Commands

```
stessa-mcp mcp                       Start the MCP server (stdio)
stessa-mcp login                     Sign in and store the session
stessa-mcp logout                    Remove the stored session
stessa-mcp install claude-code       Register with Claude Code
stessa-mcp install claude-desktop    Register in Claude Desktop config
stessa-mcp serve                     Hosted multi-user server (Railway etc.)
stessa-mcp invite <email> --server <url>   Admin: invite a teammate
```

## Tools

13 tools (`get_user`, `list_portfolios`, `get_summary`, `list_properties`, `get_property`, `list_bank_accounts`, `list_documents`, `list_tenancies`, `list_scheduled_incomes`, `get_transactions_summary`, `list_transaction_categories`, `get_report_data`, `stessa_request`) and resources `stessa://guide`, `stessa://catalog`, `stessa://property/{id}`, `stessa://portfolio/{id}`.

The `stessa_request` escape hatch reaches any of the ~110 cataloged endpoints. Money-moving banking endpoints are only reachable through it, so they are always explicit.

For the hosted (team) deployment, see [docs/DEPLOY_RAILWAY.md](https://github.com/ericmanyc/stessa-client-ts/blob/main/docs/DEPLOY_RAILWAY.md).

## License

MIT
