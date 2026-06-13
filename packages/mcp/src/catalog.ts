/**
 * Curated, grouped catalog of Stessa internal API endpoints discovered from the
 * compiled SPA bundle (docs/api-findings.md, docs/endpoints.txt). Exposed as the
 * `stessa://catalog` MCP resource and used as the reference for the
 * `stessa_request` escape-hatch tool. Base URL: https://app.stessa.com.
 */
export const CATALOG = `# Stessa API catalog (unofficial, reverse-engineered)

Base: \`https://app.stessa.com\` - paths below are relative to it. Envelope is
\`{ data: ... }\` for core endpoints and JSON:API for \`/api/v2/banking/*\`.
Money is \`{ cents, currency_iso }\`. ~110 endpoints; verbs are those observed at
direct call sites (a resource may support more). "(?)" = method undetermined.

## Auth
- GET /api/token_from_session   (session cookie -> Auth0 bearer; used internally)

## Properties
- GET, POST, PUT /api/v2/properties
- PUT /api/v2/properties/{id}
- GET /api/v2/properties/airdna_card
- GET /api/v2/properties/generate_signed_maps_url
- GET /api/v2/properties/{id}/check_scheduled_incomes_complete
- GET, POST, PUT /api/v2/properties/{id}/expenses
- POST /api/v2/properties/{slug}/expenses
- GET /api/v2/properties/{id}/export_rentroll
- PUT /api/v2/properties/{id}/import_rentroll
- GET /api/v2/properties/{id}/listing_data
- PUT /api/v2/properties/{id}/property_listing
- GET /api/v2/properties/{id}/scheduled_incomes
- PUT /api/v2/properties/{id}/sort

## Portfolios
- GET, POST /api/v2/portfolios
- PUT /api/v2/portfolios/{id}/sort
- (?) /api/v2/portfolios/request_bulk_insurance_quote
- DELETE, POST, PUT /api/v2/portfolio_members
- DELETE, PUT /api/v2/portfolio_members/{id}
- GET /api/v2/summary

## Transactions
- GET /api/v2/transactions   (web3 list; response { transactions:[...], total_pages, total_count })
- GET /api/v2/transactions/search?query=...
- POST /api/v2/transactions   (create; JSON { transaction: { name, transaction_date, amount_cents, money_in, transaction_category_id?, property_id?, notes? } })
- GET /api/v2/transaction_categories
- GET /api/v2/transactions/transactions_summary
- GET /api/v2/transactions/almost_categorized
- PUT /api/v2/transactions/categorize_with_ml
- PUT /api/v2/transactions/reject_ml_categorization

### Transaction writes - legacy /api/transactions/* (web3, verified live 2026-06-12)
These are NOT under /api/v2. Same origin (https://app.stessa.com).
- PUT /api/transactions/{id}   recategorize / reassign / edit; JSON { transaction: { id, transaction_category_id?, property_id?, ... } } (partial OK). Used by recategorize_transaction + assign_transaction_to_property.
- DELETE /api/transactions/{firstId}.json   bulk soft-delete to Trash; JSON { transaction: { transaction_ids: [...] } }. Auto-purges after 30 days; no immediate hard delete.
- PATCH /api/transactions/update_multiple   bulk inline edit; FormData (transaction[transaction_category_id], transaction[property_id], transaction[transaction_ids][]).
- PATCH /api/transactions/restore_multiple   restore from Trash; JSON { transaction_ids: [...] }.
- POST /api/transactions/merge

## Tenants / Leases
- DELETE, GET, POST, PUT /api/v2/tenancies
- DELETE, GET, POST, PUT /api/v2/tenancies/{id}
- PUT /api/v2/tenancies/{id}/enable_rent_collection
- PUT /api/v2/tenancies/{id}/disable_rent_collection
- GET /api/v2/tenancies/{id}/record_payment_url
- DELETE, POST, PUT /api/v2/tenants
- DELETE, PUT /api/v2/tenants/{id}
- DELETE, PUT /api/v2/lease_terms (+ /{id})
- DELETE, GET, PUT /api/v2/scheduled_incomes (+ /{id})

## Banking (Unit; JSON:API)
- GET /api/v2/banking/accounts (+ /{id})
- GET /api/v2/banking/account_statement_lines
- GET /api/v2/banking/applications
- GET /api/v2/banking/application_form_url
- GET /api/v2/banking/transfer_eligible_accounts
- GET /api/v2/banking/generate_link_token
- POST /api/v2/banking/create_account
- POST /api/v2/banking/create_business_card
- POST /api/v2/banking/create_individual_card
- POST /api/v2/banking/transfer
- POST /api/v2/banking/wire_transfer
- POST /api/v2/banking/user_token_verification
- (?) /api/v2/banking/user_token, /api/v2/banking/upload_bill_pay_invoice
- (?) /api/v2/check_deposits/
- PUT /api/v2/external_accounts (+ /{id})
- GET /api/v2/unit_migration/status

## Banking aggregation (Plaid / Yodlee / site logins)
- DELETE, GET, POST, PUT /api/v2/external_site_logins (+ /{id})
- GET /api/v2/external_site_logins/bank_count
- GET /api/v2/external_site_logins/link_account_eligibility
- GET /api/v2/external_sites
- GET /api/v2/plaid/link_token, /api/v2/plaid/link_token_transactions
- POST /api/v2/plaid/link_accounts, /api/v2/plaid/link_accounts_transactions
- GET /api/v2/yodlee/user_token
- (?) /api/v2/yodlee/check_provider_account, fastlink_iav_callback, fastlink_success_callback

## Documents
- GET /api/v2/documents
- GET /api/v2/document_categories (+ /organizer)
- DELETE, PATCH /api/v2/bulk/document
- (?) /api/v2/documents/bulk_download

## Reports / Dashboard
- GET /api/v2/report_data
- GET /api/v2/check_report_items
- POST /api/v2/reports
- GET /api/v2/summary
- GET /api/v2/inbox_cards (+ /check_eligibility)
- PUT /api/v2/inbox_cards/dismiss
- GET /api/v2/sidebar/app, /api/v2/sidebar/badges

## Rent estimates
- GET /api/v2/rent_estimates (+ /properties, /stripe_session)
- POST /api/v2/rent_estimates/generate_with_credit

## Roofstock
- GET /api/v2/applications/listings
- GET /api/v2/roofstock_listings, /api/v2/roofstock_newest_listings
- GET /api/v2/roofstock/valuation_history
- (?) /api/v2/roofstock/create_supply

## Users / Account / Misc
- POST /api/v2/users
- POST /api/v2/users/auth0_callback, /api/v2/users/auth0_name
- GET /api/v2/users/auth0_status, /api/v2/users/end_of_year_data, /api/v2/users/property_valuation_data
- GET, POST /api/v2/emails/subscriptions
- POST /api/v2/emails/unsubscribe_from_all
- GET /api/v2/eligible_states, /api/v2/insurance_types
- GET /api/v2/subscriptions/new
- POST /api/v2/iterable/track
- (?) /api/v2/onboarding_flag

## Separate services
- PDP: GET https://pdp.stessa.com/api/v1/{ping,addresses/public_records,properties/financial_data}; POST .../addresses/validate
- Roofstock GraphQL: POST https://www.roofstock.com/graphql
`;
