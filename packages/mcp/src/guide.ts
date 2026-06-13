export const GUIDE = `# Stessa MCP usage guide

Stessa is a rental-property accounting platform (owned by Roofstock). This MCP
server is **unofficial** and works against Stessa's internal \`/api/v2\`
endpoints, reverse-engineered from the web app. Endpoints and field names can
change without notice.

## Entities

- **Portfolio**: a group of properties. Carries rolled-up totals (market value,
  loan balance, equity, acquisition price). List with \`list_portfolios\`.
- **Property**: a rental. Has address, type, beds/baths/sqft, market value,
  loan balance, equity, and a \`portfolio_id\`. List with \`list_properties\`.
- **Transaction**: an income/expense line, with an amount, date, category
  (\`transaction_category_id\`), and \`property_id\`. Money is
  \`{ cents, currency_iso }\`. List with \`list_transactions\` (each row's \`id\`
  is what the write tools take); rollups via \`get_transactions_summary\`;
  category list via \`list_transaction_categories\`.
  - **Recategorize**: \`recategorize_transaction(transactionId, categoryId)\`.
  - **Reassign to a property**: \`assign_transaction_to_property(transactionId, propertyId)\`.
  - **Create / delete**: \`create_transaction\`, \`delete_transactions\` (delete is
    soft - moves to Trash, which Stessa auto-purges after 30 days).
  These edit real financial records: confirm the target ids with the user
  (\`list_transactions\`, \`list_transaction_categories\`, \`list_properties\`) first.
- **Bank account**: linked/Unit accounts with balances. List with
  \`list_bank_accounts\`.
- **Document**: uploaded files tagged to a property/unit/portfolio. List with
  \`list_documents\`.
- **Tenancy**: a lease/tenant arrangement with scheduled rent. List with
  \`list_tenancies\` and \`list_scheduled_incomes\`.

## Conventions

- All money values are objects: \`{ cents, currency_iso }\`. Parsers flatten
  these to \`{ cents, amount, currency }\` where \`amount\` is in dollars.
- Lists accept \`scope\` params like \`portfolio_id\`, \`property_id\`, \`unit_id\`
  and Spatie-style \`filter[...]\` filters.
- IDs in tool results (propertyId, portfolioId) are resolved to names in a
  \`references\` section where possible.

## Escape hatch

For any endpoint without a dedicated tool, use \`stessa_request\` with a method
and a path under \`/api/v2\` (see the \`stessa://catalog\` resource for the full
list). Writes that move money (banking transfers, card creation) are
intentionally only reachable through \`stessa_request\` so they are explicit.

## Authentication

Stessa uses Auth0. If a tool returns HTTP 401, the user is not signed in: open a
browser sign-in via \`stessa_login\`, or run \`stessa-mcp login\` in a terminal.
`;
