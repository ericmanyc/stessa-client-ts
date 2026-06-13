import { describe, expect, it } from "vitest";
import {
  moneyFromCents,
  parseMoney,
  parseStessaDate,
  parseStessaDateOrNull,
  toNumber,
  toNumberOrNull,
} from "../src/json.js";
import {
  parseBankAccount,
  parsePortfolio,
  parseProperty,
  parseTenancy,
  parseTransaction,
} from "../src/models.js";

describe("toNumber", () => {
  it("reads numbers and numeric strings", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber("123")).toBe(123);
  });
  it("rejects garbage", () => {
    expect(() => toNumber("abc")).toThrow();
  });
  it("nullable variant tolerates null/blank", () => {
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull("7")).toBe(7);
  });
});

describe("parseMoney", () => {
  it("flattens { cents, currency_iso }", () => {
    expect(parseMoney({ cents: 123400, currency_iso: "USD" })).toEqual({
      cents: 123400,
      amount: 1234,
      currency: "USD",
    });
  });
  it("treats a bare number as dollars", () => {
    expect(parseMoney(50)).toEqual({ cents: 5000, amount: 50, currency: "USD" });
  });
  it("returns null for absent money (null / [] / {})", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney([])).toBeNull();
    expect(parseMoney({})).toBeNull();
  });
});

describe("moneyFromCents (bare *_cents integer fields)", () => {
  it("treats the integer as cents, not dollars", () => {
    expect(moneyFromCents(200000)).toEqual({ cents: 200000, amount: 2000, currency: "USD" });
    expect(moneyFromCents("4500")).toEqual({ cents: 4500, amount: 45, currency: "USD" });
  });
  it("returns null for absent values", () => {
    expect(moneyFromCents(null)).toBeNull();
    expect(moneyFromCents(undefined)).toBeNull();
    expect(moneyFromCents("")).toBeNull();
  });
});

describe("parseStessaDate", () => {
  it("reads yyyy-MM-dd as a local date", () => {
    const d = parseStessaDate("2026-02-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(1);
  });
  it("reads ISO datetimes", () => {
    expect(parseStessaDate("2026-02-01T23:00:49.000Z").toISOString()).toBe("2026-02-01T23:00:49.000Z");
  });
  it("nullable variant tolerates the PHP empty-array quirk", () => {
    expect(parseStessaDateOrNull([])).toBeNull();
    expect(parseStessaDateOrNull(null)).toBeNull();
    expect(parseStessaDateOrNull("")).toBeNull();
  });
});

describe("model parsers", () => {
  it("parses a property with money and snake_case keys", () => {
    const p = parseProperty({
      id: 10,
      name: "742 Evergreen",
      property_type: "single_family",
      city: "Springfield",
      portfolio_id: 1,
      market_value: { cents: 25000000, currency_iso: "USD" },
      loan_balance: { cents: 10000000, currency_iso: "USD" },
    });
    expect(p.id).toBe(10);
    expect(p.portfolioId).toBe(1);
    expect(p.marketValue?.amount).toBe(250000);
    expect(p.loanBalance?.amount).toBe(100000);
  });

  it("parses a portfolio and counts properties from an array", () => {
    const pf = parsePortfolio({
      id: 1,
      name: "Main",
      properties: [{ id: 10 }, { id: 11 }],
      total_equity: { cents: 15000000, currency_iso: "USD" },
    });
    expect(pf.name).toBe("Main");
    expect(pf.propertyCount).toBe(2);
    expect(pf.totalEquity?.amount).toBe(150000);
  });

  it("parses a transaction's money amount and date", () => {
    const tx = parseTransaction({
      id: 99,
      description: "Rent",
      date: "2026-03-01",
      amount: { cents: 120000, currency_iso: "USD" },
      property_id: 10,
      account_id: 5,
    });
    expect(tx.name).toBe("Rent");
    expect(tx.amount?.amount).toBe(1200);
    expect(tx.propertyId).toBe(10);
    expect(tx.date?.getMonth()).toBe(2);
  });

  it("parses a transaction's real Stessa fields (nested external_account, tenancy, pending)", () => {
    const tx = parseTransaction({
      id: 99,
      name: "SPECTRUM",
      transaction_date: "2026-03-01",
      amount: { cents: -9000, currency_iso: "USD" },
      transaction_category_id: 45,
      transaction_category: { category: "Utilities", sub_category: "Internet" },
      property_id: 10,
      property: { name: "742 Evergreen" },
      tenancy_id: 7,
      scheduled_income_id: 3,
      external_account: { id: 5, name: "Checking", external_site: { name: "Chase" } },
      categorization_method: "rule",
      categorized_at: "2026-03-02",
      attachments_count: 2,
      owner_name: "Homer",
      pending: true,
    });
    expect(tx.categoryId).toBe(45);
    expect(tx.categoryName).toBe("Internet");
    expect(tx.accountId).toBe(5);
    expect(tx.accountName).toBe("Checking");
    expect(tx.tenancyId).toBe(7);
    expect(tx.scheduledIncomeId).toBe(3);
    expect(tx.categorizationMethod).toBe("rule");
    expect(tx.categorizedAt?.getMonth()).toBe(2);
    expect(tx.attachmentsCount).toBe(2);
    expect(tx.pending).toBe(true);
  });

  it("falls back to external_account.external_site.name when the account has no name", () => {
    const tx = parseTransaction({
      id: 1,
      external_account: { id: 9, external_site: { name: "Wells Fargo" } },
    });
    expect(tx.accountId).toBe(9);
    expect(tx.accountName).toBe("Wells Fargo");
  });

  it("parses a tenancy with status, balance, cents money, and tenants", () => {
    const t = parseTenancy({
      id: 12,
      property_id: 10,
      scheduled_income_id: 3,
      status: "active",
      balance_status: "overdue",
      rent_amount_cents: 150000,
      current_balance_cents: 30000,
      last_month_balance_cents: 0,
      lease_start_date: "2026-01-01",
      lease_end_date: "2026-12-31",
      month_to_month: false,
      draft: false,
      stessa_rent_pay: true,
      tenants: [
        { id: 1, name: "Marge", primary: true },
        { id: 2, name: "Homer", primary: false },
      ],
    });
    expect(t.status).toBe("active");
    expect(t.balanceStatus).toBe("overdue");
    expect(t.rentAmount?.amount).toBe(1500);
    expect(t.currentBalance?.amount).toBe(300);
    expect(t.stessaRentPay).toBe(true);
    expect(t.leaseEndDate?.getFullYear()).toBe(2026);
    expect(t.tenants).toHaveLength(2);
    expect(t.tenants[0]).toEqual({ id: 1, name: "Marge", primary: true });
  });

  it("parses a Unit-style bank account (flattened JSON:API attributes)", () => {
    const acct = parseBankAccount({
      id: 5,
      type: "account",
      balance: { cents: 4567800, currency_iso: "USD" },
      mask: "1234",
    });
    expect(acct.id).toBe(5);
    expect(acct.balance?.amount).toBe(45678);
    expect(acct.mask).toBe("1234");
  });
});
