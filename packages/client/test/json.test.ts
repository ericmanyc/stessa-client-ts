import { describe, expect, it } from "vitest";
import { parseMoney, parseStessaDate, parseStessaDateOrNull, toNumber, toNumberOrNull } from "../src/json.js";
import { parseBankAccount, parsePortfolio, parseProperty, parseTransaction } from "../src/models.js";

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
