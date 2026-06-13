import { describe, expect, it } from "vitest";
import { flattenItem, parseList, parseOne, withQuery } from "../src/resources/envelope.js";

describe("parseList", () => {
  it("reads a bare data array", () => {
    const { items, pagination } = parseList({ data: [{ id: 1 }, { id: 2 }] });
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 1 });
    expect(pagination.page).toBe(1);
  });

  it("reads a nested named collection with custom pagination", () => {
    const { items, pagination } = parseList(
      {
        data: {
          portfolios: [{ id: 1, name: "Main" }],
          pagination: { page: 2, per_page: 25, total_pages: 4, total: 90 },
        },
      },
      "portfolios",
    );
    expect(items).toEqual([{ id: 1, name: "Main" }]);
    expect(pagination).toEqual({ page: 2, perPage: 25, totalPages: 4, total: 90 });
  });

  it("auto-detects the single array property when no key is given", () => {
    const { items } = parseList({ data: { documents: [{ id: 7 }] } });
    expect(items).toEqual([{ id: 7 }]);
  });

  it("flattens JSON:API banking items into { id, type, ...attributes }", () => {
    const { items } = parseList({
      data: [{ id: 5, type: "account", attributes: { balance: { cents: 100 }, mask: "1234" } }],
    });
    expect(items[0]).toEqual({ balance: { cents: 100 }, mask: "1234", id: 5, type: "account" });
  });

  it("returns an empty list for an empty payload", () => {
    expect(parseList({}).items).toEqual([]);
    expect(parseList(null).items).toEqual([]);
  });
});

describe("parseOne / flattenItem", () => {
  it("unwraps a single resource", () => {
    expect(parseOne({ data: { id: 3, name: "x" } })).toEqual({ id: 3, name: "x" });
  });
  it("flattens JSON:API attributes", () => {
    expect(flattenItem({ id: 1, type: "t", attributes: { a: 1 } })).toEqual({ a: 1, id: 1, type: "t" });
  });
});

describe("withQuery", () => {
  it("appends params and skips null/undefined", () => {
    expect(withQuery("/api/v2/properties", { page: 1, portfolio_id: undefined, q: null, s: "x" })).toBe(
      "/api/v2/properties?page=1&s=x",
    );
  });
  it("returns the path unchanged when there is nothing to add", () => {
    expect(withQuery("/p", {})).toBe("/p");
    expect(withQuery("/p")).toBe("/p");
  });
});
