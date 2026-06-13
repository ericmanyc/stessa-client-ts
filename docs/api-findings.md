# Stessa (app.stessa.com) API Reverse-Engineering Findings

Reverse-engineered from public compiled Vue.js bundles on
https://assets-vuejs.stessa.com/prod/js/. No login was performed.

Stessa is a Vue CLI 4 SPA owned by Roofstock. REST API is same-origin
(https://app.stessa.com/api and /api/v2). Auth is Auth0 (custom domain
auth.roofstock.com). Banking is Unit (api.unit.co) proxied through Stessa;
aggregation uses Plaid + Yodlee.

## 1. Bundle / Chunk Inventory
- 18 lazy chunk-*.js downloaded (chunk-vendors excluded per scope).
- Total downloaded chunk bytes: 1,844,340 (~1.76 MB).
- Most API/service code is in app.26d4f670.js (~1.06 MB).
- Largest chunks are NOT API code: chunk-password-strength (853 KB, zxcvbn
  dictionary), chunk-3bfafcda (708 KB, charting/PDF vendor).

## 2. Auth0 Configuration
Auth0 options object built in app.js:
    M = { domain: "auth.roofstock.com", clientId: "lpXpR0vUTFsI0uxTfNe6m0MoTcKnf6em" }
    // + optional M.connection from ?connection= query param
- AUTH0_DOMAIN: auth.roofstock.com (custom domain, Roofstock tenant)
- AUTH0_CLIENT_ID: lpXpR0vUTFsI0uxTfNe6m0MoTcKnf6em
- audience: NONE. No `audience` passed to the Auth0 client or getTokenSilently.
  The string "audience" does not appear in app.js (only in the password dict).
- scope: not overridden (SDK default openid profile email).

Token attachment:
    f.defaults.headers.Authorization = "Bearer " + store.getters.getAuthorizationToken
    // per-request: return "Bearer " + store.getters.getAuthorizationToken
- Header: Authorization: Bearer <token>, token from Vuex getter
  getAuthorizationToken (populated after Auth0 getTokenSilently()).
- axios instance also sets withCredentials: true (cookies sent too).
- Session->token exchange endpoint: GET /api/token_from_session.

Auth0 token cache: cacheLocation/useRefreshTokens NOT set in app.js -> SDK
default in-memory cache (no @@auth0spajs@@ localStorage key written by default;
the SDK lives in out-of-scope chunk-vendors). App localStorage keys observed:
app_version, ajs_anonymous_id, unit_customer_token, cardWithUnsetPin.

Login/redirect/callback:
- Login base: origin + "/login". On 401 -> origin + "/login?redirect_to=<enc url>".
- redirect_uri defaults to window.location.origin (overridable).
- Callback paths: <origin>/web/onboarding/roofstock-login-success (optional
  ?rp=...) and <origin>/web3/login-success.
- PKCE code flow (handled when search has code= and state=).
- Backend linkage: POST /api/v2/users/auth0_callback, POST /api/v2/users/auth0_name,
  GET /api/v2/users/auth0_status.

## 3. API Base URLs (same-origin https://app.stessa.com)
- xo = origin + "/api"     (v1; used only by /api/token_from_session)
- Eo = origin + "/api/v2"  (primary base; nearly every endpoint)
Runtime config: VUE_APP_API="/api", VUE_APP_API2="/api/v2", VUE_APP_BASE="".
axios.create({ baseURL: origin, headers:{Accept:"application/json",
"Cache-Control":"No-Cache"}, withCredentials:true }).

Other service bases:
- PDP: https://pdp.stessa.com/api/v1/ (ls(path)=cs+"/api/v1/"+path).
- Roofstock GraphQL: https://www.roofstock.com/graphql (URL configured; no
  inline gql operation strings in scanned bundles).
- Unit banking: https://api.unit.co (VGS vault tnt8w6nrmbu), proxied via
  /api/v2/banking/*.

## 4. HTTP Service Layer
Single async wrapper v(method,url,body,opts) over the axios instance; named
exports: post(url,body,cancelToken), get(url,params,opts), put(url,body),
patch(url,body,opts), Delete(url,body) [body as {data}], postFormData/putFormData
(multipart), plus getApiWithCache(url,params,cacheKey) cached GET. Path params
substituted with .replace("{id}", value).

## 5. Endpoint Catalog
110 distinct Stessa /api(+/v2) endpoint path templates; 100 have a confirmed
HTTP verb (133 method+path pairs). 10 are dispatched via dynamic store-action
wrappers and marked (method undetermined) - not guessed. Plus 4 PDP /api/v1
endpoints and Roofstock GraphQL. Full list also in endpoints.txt.

### Auth (1)
- GET /api/token_from_session

### Properties (13)
- GET,POST,PUT /api/v2/properties
- GET /api/v2/properties/airdna_card
- GET /api/v2/properties/generate_signed_maps_url
- PUT /api/v2/properties/{id}
- GET /api/v2/properties/{id}/check_scheduled_incomes_complete
- GET,POST,PUT /api/v2/properties/{id}/expenses
- GET /api/v2/properties/{id}/export_rentroll
- PUT /api/v2/properties/{id}/import_rentroll
- GET /api/v2/properties/{id}/listing_data
- PUT /api/v2/properties/{id}/property_listing
- GET /api/v2/properties/{id}/scheduled_incomes
- PUT /api/v2/properties/{id}/sort
- POST /api/v2/properties/{slug}/expenses

### Portfolio (5)
- DELETE,POST,PUT /api/v2/portfolio_members
- DELETE,PUT /api/v2/portfolio_members/{id}
- GET,POST /api/v2/portfolios
- (method undetermined) /api/v2/portfolios/request_bulk_insurance_quote
- PUT /api/v2/portfolios/{id}/sort

### Transactions (7)
- GET /api/v2/transaction_categories
- POST /api/v2/transactions
- GET /api/v2/transactions/almost_categorized
- PUT /api/v2/transactions/categorize_with_ml
- PUT /api/v2/transactions/reject_ml_categorization
- GET /api/v2/transactions/transaction_macro
- GET /api/v2/transactions/transactions_summary

### Tenants/Leases (11)
- DELETE,PUT /api/v2/lease_terms
- DELETE,PUT /api/v2/lease_terms/{id}
- DELETE,GET,PUT /api/v2/scheduled_incomes
- DELETE,GET,PUT /api/v2/scheduled_incomes/{id}
- DELETE,GET,POST,PUT /api/v2/tenancies
- DELETE,GET,POST,PUT /api/v2/tenancies/{id}
- PUT /api/v2/tenancies/{id}/disable_rent_collection
- PUT /api/v2/tenancies/{id}/enable_rent_collection
- GET /api/v2/tenancies/{id}/record_payment_url
- DELETE,POST,PUT /api/v2/tenants
- DELETE,PUT /api/v2/tenants/{id}

### Banking (21)
- GET /api/v2/banking/account_statement_lines
- GET /api/v2/banking/accounts
- GET /api/v2/banking/accounts/{id}
- GET /api/v2/banking/application_form_url
- GET /api/v2/banking/applications
- POST /api/v2/banking/create_account
- POST /api/v2/banking/create_business_card
- POST /api/v2/banking/create_individual_card
- GET /api/v2/banking/generate_link_token
- GET /api/v2/banking/plaid_verification_success_callback
- GET /api/v2/banking/reset_plaid_verification
- POST /api/v2/banking/transfer
- GET /api/v2/banking/transfer_eligible_accounts
- (method undetermined) /api/v2/banking/upload_bill_pay_invoice
- (method undetermined) /api/v2/banking/user_token
- POST /api/v2/banking/user_token_verification
- POST /api/v2/banking/wire_transfer
- (method undetermined) /api/v2/check_deposits/
- PUT /api/v2/external_accounts
- PUT /api/v2/external_accounts/{id}
- GET /api/v2/unit_migration/status

### Banking/Aggregation (13)
- DELETE,GET,POST,PUT /api/v2/external_site_logins
- GET /api/v2/external_site_logins/bank_count
- GET /api/v2/external_site_logins/link_account_eligibility
- DELETE,GET,PUT /api/v2/external_site_logins/{id}
- GET /api/v2/external_sites
- POST /api/v2/plaid/link_accounts
- POST /api/v2/plaid/link_accounts_transactions
- GET /api/v2/plaid/link_token
- GET /api/v2/plaid/link_token_transactions
- (method undetermined) /api/v2/yodlee/check_provider_account?provider_account_id={provider_account_id}
- (method undetermined) /api/v2/yodlee/fastlink_iav_callback?provider_account_id={provider_account_id}&customer_token={customer_token}
- (method undetermined) /api/v2/yodlee/fastlink_success_callback?provider_account_id={provider_account_id}
- GET /api/v2/yodlee/user_token

### Documents (5)
- DELETE,PATCH /api/v2/bulk/document
- GET /api/v2/document_categories
- GET /api/v2/document_categories/organizer
- GET /api/v2/documents
- (method undetermined) /api/v2/documents/bulk_download

### Reports (4)
- GET /api/v2/check_report_items
- GET /api/v2/report_data
- POST /api/v2/reports
- GET /api/v2/summary

### Inbox/Dashboard (5)
- GET /api/v2/inbox_cards
- GET /api/v2/inbox_cards/check_eligibility
- PUT /api/v2/inbox_cards/dismiss
- GET /api/v2/sidebar/app
- GET /api/v2/sidebar/badges

### Rent Estimates (4)
- GET /api/v2/rent_estimates
- POST /api/v2/rent_estimates/generate_with_credit
- GET /api/v2/rent_estimates/properties
- GET /api/v2/rent_estimates/stripe_session

### Roofstock (5)
- GET /api/v2/applications/listings
- (method undetermined) /api/v2/roofstock/create_supply
- GET /api/v2/roofstock/valuation_history
- GET /api/v2/roofstock_listings
- GET /api/v2/roofstock_newest_listings

### Users/Account (11)
- GET,POST /api/v2/emails/subscriptions
- POST /api/v2/emails/unsubscribe_from_all
- POST /api/v2/users
- POST /api/v2/users/auth0_callback
- POST /api/v2/users/auth0_name
- GET /api/v2/users/auth0_status
- GET /api/v2/users/end_of_year_data
- GET /api/v2/users/property_valuation_data
- GET /api/v2/users/segment_track
- GET /api/v2/validations/email
- GET /api/v2/validations/verify_email_exists_with_roofstock

### Billing/Misc (5)
- GET /api/v2/eligible_states
- GET /api/v2/insurance_types
- POST /api/v2/iterable/track
- (method undetermined) /api/v2/onboarding_flag
- GET /api/v2/subscriptions/new

### PDP service (https://pdp.stessa.com/api/v1)
- GET /api/v1/ping
- POST /api/v1/addresses/validate
- GET /api/v1/addresses/public_records
- GET /api/v1/properties/financial_data

### GraphQL
- POST https://www.roofstock.com/graphql (Roofstock marketplace/valuation; no inline ops found)

## 6. Response Envelope Shape(s)
Client wraps every response: s=function(t){this.success=true;this.data=t}
(t = axios response body); error c=function(t,e){this.success=false;this.status=t;this.data=e}.
Callers read wrapper.data.data.

Two API envelopes:
(a) Core /api/v2/* : { data: ... } wrapper (44 .data.data sites; collections
    nest named arrays e.g. a.data.data.portfolios). Pagination is custom
    { page, per_page, total_pages } (NOT Laravel paginator, NOT cursor).
    Request params: page, per_page, plus Spatie/Laravel bracket params:
    filter[unit_id], filter[keywords], filter[category_id], filter[date_gte],
    filter[date_lte], filter[accountId], sort[column], sort[direction],
    sort[relation]; scope params portfolio_id, property_id, unit_id.
    NOT JSON:API (zero jsonapi/included/.data.links).
(b) Banking (Unit) /api/v2/banking/* : JSON:API. Shape
    { data: { id, type, attributes:{...} } } or { data: [ {id,type,attributes} ] }.
    Evidence: n.data.attributes.balance, r.data.data.attributes,
    { data:{ type:"billPayment", attributes:{ billerId } } }, t.attributes.createdAt.

## 7. Core Entities & Fields
Money is always { cents, currency_iso } (e.g. {cents:0,currency_iso:"USD"}).
- Property: id, slug, title/name, property_type, address, city, state, zip,
  year_built, beds, baths, sqft, units[], market_value, acquisition_price,
  purchase_price, loan_balance, equity, occupancy_level(s), position,
  portfolio_id, collaborators[], permissions, summary.
- Unit: unit_name, beds, baths, sqft, property_slug.
- Mortgage/Loan: expense_type, frequency, payment_amount{cents,currency_iso},
  loan:{amortization, interest_rate, original_loan_amount, origination_date,
  principal_balance{cents,currency_iso}, term_years}.
- Transaction: id, amount, date, category_id, account_id, portfolio_id,
  property_id, unit_id, document_category_id, name, notes (+ ML categorization).
- Banking Account (Unit JSON:API): attributes:{ balance/current_balance,
  available_balance, charge_count, charge_total, last_month_balance,
  institution_id, mask, account_type } (all money as {cents,currency_iso}).
- External account: id, name, account_id, account_number, account_type,
  routing_number, balance_amount, external_site_name, displayed_name,
  institution_id, unit_counterparty_id.
- Portfolio: id, name, position, properties[], total_acquisition_price,
  total_market_value, total_loan_balance, total_equity, occupancy_levels[].
- Tenancy/Lease: tenancy_id, external_account_id, tenancy_details; siblings
  tenants, lease_terms, scheduled_incomes. Body wrappers {property:{}},
  {portfolio:{}}, {property_listing:{}}.
- Document: id, uuid, name, notes, date, document_category_id, portfolio_id,
  property_id, unit_id, total, bytesSent (upload progress).

## 8. Notable for Building a Client
- Auth: Auth0 PKCE (auth.roofstock.com, client lpXpR0vUTFsI0uxTfNe6m0MoTcKnf6em,
  NO audience/scope override). Send Authorization: Bearer <auth0 access token>;
  also send cookies (withCredentials). Session->token: GET /api/token_from_session.
- No CSRF mechanism: no X-CSRF-TOKEN / XSRF-TOKEN / X-Requested-With; only
  Authorization header.
- Versioning is path-based (/api vs /api/v2). Server returns x-app-version
  response header (client uses it to force a frontend refresh, not an API gate).
- Default headers: Accept: application/json, Cache-Control: No-Cache;
  Content-Type application/json for writes, multipart/form-data for file uploads.
- Error contract: non-500 errors carry response.data.error.detail; 401 wipes
  the token and redirects to /login?redirect_to=... unless params.noRedirect.
  Canceled requests map to internal 418. No rate-limit headers seen client-side.
- Two envelopes (branch parsing by resource area); money is {cents,currency_iso};
  path params are {id}/{slug} templates.
- Third-party surfaces: Unit (api.unit.co, VGS vault tnt8w6nrmbu) for banking;
  Plaid + Yodlee for aggregation; PDP (pdp.stessa.com/api/v1) for address/financial
  data; Roofstock GraphQL for marketplace/valuation; Stripe (pk_live_...) billing;
  Segment, Datadog RUM, LaunchDarkly, reCAPTCHA.

## Method-resolution confidence
Endpoint PATHS are exhaustively/reliably extracted from the URL-constant block
(base + "/path"). METHODS resolved by tracing each URL constant (+ webpack
re-export aliases) to its service call site (get/post/put/patch/Delete,
getApiWithCache, .replace("{id}",...)). 100/110 endpoints have a confirmed verb;
the 10 (method undetermined) ones are invoked via indirect store dispatch and
left unguessed. Some resources (e.g. transactions) support more verbs than the
single one confirmed at a direct call site.
