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

## Field reference

### Transaction
Beyond \`id\`/\`name\`/\`date\`/\`amount\`, a transaction carries:
\`transaction_category_id\` (+ nested \`transaction_category.category\` /
\`.sub_category\`), \`property_id\` (+ nested \`property.name\`), \`portfolio_id\`,
\`tenancy_id\`, \`scheduled_income_id\`, the linked bank account as
\`external_account\` (\`id\`, \`name\`, \`external_site.name\`),
\`categorization_method\` + \`categorized_at\`, \`attachments_count\`, \`owner_name\`,
\`pending\`, and \`deleted_at\` (set when trashed). The parser surfaces these as
\`accountId\`/\`accountName\`, \`tenancyId\`, \`scheduledIncomeId\`, etc.

### Tenancy
\`status\` is one of **active, expires_soon, expired, future**. \`balance_status\`
is one of **overdue, current, paid**. Money fields arrive as bare cents
(\`rent_amount_cents\`, \`current_balance_cents\`, \`last_month_balance_cents\`) and
are flattened to \`{ cents, amount, currency }\`. Also: \`lease_start_date\` /
\`lease_end_date\`, \`move_in\` / \`move_out\`, \`month_to_month\`, \`draft\`,
\`stessa_rent_pay\` (online rent collection on/off), and \`tenants[]\`
(\`{ id, name, primary }\`).

## Transaction categorization workflow

This is the most common Stessa task. Work through the API, never guess:

1. **Pull what needs review** - \`list_transactions\` with \`needsReview: true\`.
2. **For each one, look for prior matches** - \`list_transactions\` with
   \`search: "<vendor/payee>"\` (e.g. "SPECTRUM", "RG&E", "CHASE CREDIT CRD").
   Match on, in order: vendor/payee name (primary), statement description, a
   matching amount, and recurring monthly timing.
3. **Apply the prior categorization** - reuse that match's
   \`transaction_category_id\` (and \`property_id\`) on the new transaction:
   \`recategorize_transaction\` for the category, \`assign_transaction_to_property\`
   for the property.
4. **Verify** it left "Needs Review" (re-run step 1).

Rules: always search before categorizing; if there is no prior match, leave it
in "Needs Review" and flag it for the user rather than guessing; keep a vendor's
categorization consistent within a portfolio/property.

## Conventions & gotchas

- All money values are objects \`{ cents, currency_iso }\` (flattened to
  \`{ cents, amount, currency }\`, \`amount\` in dollars). Bare \`*_cents\` integer
  fields are cents, not dollars.
- Lists accept \`scope\` params (\`portfolio_id\`, \`property_id\`, \`unit_id\`) and
  Spatie-style \`filter[...]\` filters.
- IDs in tool results (propertyId, portfolioId) are resolved to names in a
  \`references\` section where possible.
- **"Needs Review" is per-user** - each Stessa login sees only its own
  uncategorized transactions, so counts differ between accounts.
- **\`list_tenancies\` returns every tenancy** in the account; scope or filter
  client-side by property if you need one property's leases.
- **Delete is soft** - transactions move to Trash and Stessa auto-purges after
  30 days; there is no immediate hard delete.

## Escape hatch

For any endpoint without a dedicated tool, use \`stessa_request\` with a method
and a path under \`/api/v2\` (see the \`stessa://catalog\` resource for the full
list). Writes that move money (banking transfers, card creation) are
intentionally only reachable through \`stessa_request\` so they are explicit.

Useful read endpoints with no dedicated tool yet:
- \`GET /api/v2/transactions/user_data\` - one call returning all properties,
  portfolios (with nested property ids), and linked accounts; a cheap overview.
- \`GET /api/v2/transactions/transaction_macro\` - transaction aggregates.
- \`GET /api/v2/summary?resource_type=property&resource_id=<id>\` - per-property
  counts (documents, photos, receipts, transactions, enrolled tenancies).
- \`GET /api/v2/projects\`, \`GET /api/v2/new_inbox_cards\`,
  \`GET /api/v2/mileage_rates\` - capex projects, dashboard inbox, IRS mileage rates.
- \`POST /api/v2/transactions/fetch_attachments\` with \`{ "transaction_ids": [...] }\`.

Note: writes go to the legacy \`/api/\` prefix (e.g. \`PUT /api/transactions/{id}\`),
not \`/api/v2/\`.

## Authentication

Stessa uses Auth0. If a tool returns HTTP 401, the user is not signed in: open a
browser sign-in via \`stessa_login\`, or run \`stessa-mcp login\` in a terminal.
`;
