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
  accountId: number | null;
  portfolioId: number | null;
  propertyId: number | null;
  propertyName: string | null;
  unitId: number | null;
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

export function parseTransaction(raw: Record<string, unknown>): StessaTransaction {
  const cat = pick(raw, "transaction_category", "category");
  return {
    id: toNumber(pick(raw, "id") ?? 0),
    name: toStringOrNull(pick(raw, "name", "description", "merchant_name")),
    date: parseStessaDateOrNull(pick(raw, "transaction_date", "date", "posted_at")),
    amount: parseMoney(pick(raw, "amount")),
    categoryId: toNumberOrNull(pick(raw, "transaction_category_id", "category_id", "categoryId")),
    categoryName: nestedName(cat, "sub_category", "category", "name"),
    accountId: toNumberOrNull(pick(raw, "account_id", "accountId")),
    portfolioId: toNumberOrNull(pick(raw, "portfolio_id")),
    propertyId: toNumberOrNull(pick(raw, "property_id")),
    propertyName: nestedName(pick(raw, "property"), "name", "title"),
    unitId: toNumberOrNull(pick(raw, "unit_id")),
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

export interface StessaTenancy {
  id: number;
  propertyId: number | null;
  unitId: number | null;
  externalAccountId: number | null;
  rentCollectionEnabled: boolean;
  raw: Record<string, unknown>;
}

export function parseTenancy(raw: Record<string, unknown>): StessaTenancy {
  return {
    id: toNumber(pick(raw, "id", "tenancy_id") ?? 0),
    propertyId: toNumberOrNull(pick(raw, "property_id")),
    unitId: toNumberOrNull(pick(raw, "unit_id")),
    externalAccountId: toNumberOrNull(pick(raw, "external_account_id")),
    rentCollectionEnabled: toBoolean(pick(raw, "rent_collection_enabled", "rent_collection")),
    raw,
  };
}
