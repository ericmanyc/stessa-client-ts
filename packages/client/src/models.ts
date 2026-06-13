/**
 * Stessa domain models and best-effort parsers.
 *
 * Field names are reverse-engineered from the compiled SPA bundle (see
 * docs/api-findings.md) and not yet all verified against live payloads, so each
 * parser uses `pick()` over several candidate keys and keeps a `raw` copy of the
 * original object for anything not modelled. Money fields are `{ cents,
 * currency_iso }` and are flattened to `Money` via `parseMoney`.
 */
import {
  moneyFromCents,
  parseMoney,
  parseStessaDateOrNull,
  pick,
  toBoolean,
  toNumber,
  toNumberOrNull,
  toStringOrNull,
  type Money,
} from "./json.js";

export interface StessaProperty {
  id: number;
  slug: string | null;
  name: string | null;
  propertyType: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  yearBuilt: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  portfolioId: number | null;
  marketValue: Money | null;
  purchasePrice: Money | null;
  loanBalance: Money | null;
  equity: Money | null;
  raw: Record<string, unknown>;
}

export function parseProperty(raw: Record<string, unknown>): StessaProperty {
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    slug: toStringOrNull(pick(raw, "slug")),
    name: toStringOrNull(pick(raw, "name", "title", "displayed_name")),
    propertyType: toStringOrNull(pick(raw, "property_type", "propertyType")),
    address: toStringOrNull(pick(raw, "address", "address1", "street_address")),
    city: toStringOrNull(pick(raw, "city")),
    state: toStringOrNull(pick(raw, "state")),
    zip: toStringOrNull(pick(raw, "zip", "zip_code", "postal_code")),
    yearBuilt: toNumberOrNull(pick(raw, "year_built", "yearBuilt")),
    beds: toNumberOrNull(pick(raw, "beds", "bedrooms")),
    baths: toNumberOrNull(pick(raw, "baths", "bathrooms")),
    sqft: toNumberOrNull(pick(raw, "sqft", "square_feet")),
    portfolioId: toNumberOrNull(pick(raw, "portfolio_id", "portfolioId")),
    marketValue: parseMoney(pick(raw, "market_value", "marketValue")),
    purchasePrice: parseMoney(pick(raw, "purchase_price", "acquisition_price")),
    loanBalance: parseMoney(pick(raw, "loan_balance", "principal_balance")),
    equity: parseMoney(pick(raw, "equity")),
    raw,
  };
}

export function propertyLabel(property: StessaProperty): string {
  return property.name ?? property.address ?? property.slug ?? `property ${property.id}`;
}

export interface StessaPortfolio {
  id: number;
  name: string | null;
  position: number | null;
  propertyCount: number | null;
  totalMarketValue: Money | null;
  totalAcquisitionPrice: Money | null;
  totalLoanBalance: Money | null;
  totalEquity: Money | null;
  raw: Record<string, unknown>;
}

export function parsePortfolio(raw: Record<string, unknown>): StessaPortfolio {
  const properties = pick(raw, "properties");
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    name: toStringOrNull(pick(raw, "name", "title")),
    position: toNumberOrNull(pick(raw, "position")),
    propertyCount: Array.isArray(properties)
      ? properties.length
      : toNumberOrNull(pick(raw, "property_count", "properties_count")),
    totalMarketValue: parseMoney(pick(raw, "total_market_value")),
    totalAcquisitionPrice: parseMoney(pick(raw, "total_acquisition_price")),
    totalLoanBalance: parseMoney(pick(raw, "total_loan_balance")),
    totalEquity: parseMoney(pick(raw, "total_equity")),
    raw,
  };
}

export interface StessaTransaction {
  id: number;
  name: string | null;
  date: Date | null;
  amount: Money | null;
  /** Category id; on web3 this is `transaction_category_id`. */
  categoryId: number | null;
  categoryName: string | null;
  /** The linked bank account; comes back nested as `external_account`. */
  accountId: number | null;
  accountName: string | null;
  portfolioId: number | null;
  propertyId: number | null;
  propertyName: string | null;
  unitId: number | null;
  tenancyId: number | null;
  scheduledIncomeId: number | null;
  /** How it was categorized (e.g. "rule", "manual"). */
  categorizationMethod: string | null;
  categorizedAt: Date | null;
  attachmentsCount: number | null;
  ownerName: string | null;
  pending: boolean;
  deletedAt: Date | null;
  notes: string | null;
  raw: Record<string, unknown>;
}

function nestedName(value: unknown, ...keys: string[]): string | null {
  if (value && typeof value === "object") {
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v === "string" && v) {
        return v;
      }
    }
  }
  return null;
}

function nestedNumber(value: unknown, ...keys: string[]): number | null {
  if (value && typeof value === "object") {
    for (const k of keys) {
      const n = toNumberOrNull((value as Record<string, unknown>)[k]);
      if (n !== null) {
        return n;
      }
    }
  }
  return null;
}

export function parseTransaction(raw: Record<string, unknown>): StessaTransaction {
  const cat = pick(raw, "transaction_category", "category");
  const account = pick(raw, "external_account");
  const externalSite =
    account && typeof account === "object"
      ? (account as Record<string, unknown>)["external_site"]
      : null;
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    name: toStringOrNull(pick(raw, "name", "description", "merchant_name")),
    date: parseStessaDateOrNull(pick(raw, "transaction_date", "date", "posted_at")),
    amount: parseMoney(pick(raw, "amount")),
    categoryId: toNumberOrNull(pick(raw, "transaction_category_id", "category_id", "categoryId")),
    categoryName: nestedName(cat, "sub_category", "category", "name"),
    accountId: toNumberOrNull(pick(raw, "account_id", "accountId")) ?? nestedNumber(account, "id"),
    accountName: nestedName(account, "name") ?? nestedName(externalSite, "name"),
    portfolioId: toNumberOrNull(pick(raw, "portfolio_id")),
    propertyId: toNumberOrNull(pick(raw, "property_id")),
    propertyName: nestedName(pick(raw, "property"), "name", "title"),
    unitId: toNumberOrNull(pick(raw, "unit_id")),
    tenancyId: toNumberOrNull(pick(raw, "tenancy_id")),
    scheduledIncomeId: toNumberOrNull(pick(raw, "scheduled_income_id")),
    categorizationMethod: toStringOrNull(pick(raw, "categorization_method")),
    categorizedAt: parseStessaDateOrNull(pick(raw, "categorized_at")),
    attachmentsCount: toNumberOrNull(pick(raw, "attachments_count")),
    ownerName: toStringOrNull(pick(raw, "owner_name")),
    pending: toBoolean(pick(raw, "pending")),
    deletedAt: parseStessaDateOrNull(pick(raw, "deleted_at")),
    notes: toStringOrNull(pick(raw, "notes")),
    raw,
  };
}

/** A bank account, as proxied from Unit (JSON:API attributes, money objects). */
export interface StessaBankAccount {
  id: number;
  name: string | null;
  accountType: string | null;
  mask: string | null;
  institutionId: number | null;
  balance: Money | null;
  availableBalance: Money | null;
  raw: Record<string, unknown>;
}

export function parseBankAccount(raw: Record<string, unknown>): StessaBankAccount {
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    name: toStringOrNull(pick(raw, "name", "displayed_name", "nickname")),
    accountType: toStringOrNull(pick(raw, "account_type", "accountType")),
    mask: toStringOrNull(pick(raw, "mask", "account_number")),
    institutionId: toNumberOrNull(pick(raw, "institution_id")),
    balance: parseMoney(pick(raw, "balance", "current_balance", "balance_amount")),
    availableBalance: parseMoney(pick(raw, "available_balance", "availableBalance")),
    raw,
  };
}

export interface StessaDocument {
  id: number;
  uuid: string | null;
  name: string | null;
  notes: string | null;
  date: Date | null;
  documentCategoryId: number | null;
  portfolioId: number | null;
  propertyId: number | null;
  unitId: number | null;
  raw: Record<string, unknown>;
}

export function parseDocument(raw: Record<string, unknown>): StessaDocument {
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    uuid: toStringOrNull(pick(raw, "uuid")),
    name: toStringOrNull(pick(raw, "name", "filename")),
    notes: toStringOrNull(pick(raw, "notes")),
    date: parseStessaDateOrNull(pick(raw, "date")),
    documentCategoryId: toNumberOrNull(pick(raw, "document_category_id")),
    portfolioId: toNumberOrNull(pick(raw, "portfolio_id")),
    propertyId: toNumberOrNull(pick(raw, "property_id")),
    unitId: toNumberOrNull(pick(raw, "unit_id")),
    raw,
  };
}

export interface StessaTenant {
  id: number | null;
  name: string | null;
  primary: boolean;
}

export interface StessaTenancy {
  id: number;
  propertyId: number | null;
  unitId: number | null;
  scheduledIncomeId: number | null;
  /** Lease lifecycle: active, expires_soon, expired, future. */
  status: string | null;
  /** Rent balance state: overdue, current, paid. */
  balanceStatus: string | null;
  rentAmount: Money | null;
  currentBalance: Money | null;
  lastMonthBalance: Money | null;
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  moveIn: Date | null;
  moveOut: Date | null;
  monthToMonth: boolean;
  draft: boolean;
  /** Whether Stessa Rent Pay (online rent collection) is enabled. */
  stessaRentPay: boolean;
  tenants: StessaTenant[];
  raw: Record<string, unknown>;
}

function parseTenant(raw: unknown): StessaTenant {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: toNumberOrNull(pick(r, "id")),
    name: toStringOrNull(pick(r, "name")),
    primary: toBoolean(pick(r, "primary")),
  };
}

export function parseTenancy(raw: Record<string, unknown>): StessaTenancy {
  const tenants = pick(raw, "tenants");
  return {
    id: toNumber(pick(raw, "id", "tenancy_id") ?? 0),
    propertyId: toNumberOrNull(pick(raw, "property_id")),
    unitId: toNumberOrNull(pick(raw, "unit_id")),
    scheduledIncomeId: toNumberOrNull(pick(raw, "scheduled_income_id")),
    status: toStringOrNull(pick(raw, "status")),
    balanceStatus: toStringOrNull(pick(raw, "balance_status")),
    rentAmount: moneyFromCents(pick(raw, "rent_amount_cents")),
    currentBalance: moneyFromCents(pick(raw, "current_balance_cents")),
    lastMonthBalance: moneyFromCents(pick(raw, "last_month_balance_cents")),
    leaseStartDate: parseStessaDateOrNull(pick(raw, "lease_start_date")),
    leaseEndDate: parseStessaDateOrNull(pick(raw, "lease_end_date")),
    moveIn: parseStessaDateOrNull(pick(raw, "move_in")),
    moveOut: parseStessaDateOrNull(pick(raw, "move_out")),
    monthToMonth: toBoolean(pick(raw, "month_to_month")),
    draft: toBoolean(pick(raw, "draft")),
    stessaRentPay: toBoolean(pick(raw, "stessa_rent_pay")),
    tenants: Array.isArray(tenants) ? tenants.map(parseTenant) : [],
    raw,
  };
}
