import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StaticTokenProvider, StessaClient } from "stessa-client";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const money = (dollars: number) => ({ cents: dollars * 100, currency_iso: "USD" });

/** Routes fetch calls by URL substring to canned Stessa responses. */
function fakeStessa(): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v2/sidebar/app")) {
      return jsonResponse({ data: { user: { id: 500, email: "pat@example.com", first_name: "Pat" } } });
    }
    if (url.includes("/api/v2/properties")) {
      return jsonResponse({
        data: {
          properties: [
            {
              id: 10,
              name: "742 Evergreen Terrace",
              city: "Springfield",
              portfolio_id: 1,
              market_value: money(250000),
              loan_balance: money(100000),
            },
          ],
          pagination: { page: 1, per_page: 100, total_pages: 1, total: 1 },
        },
      });
    }
    if (url.includes("/api/v2/portfolios")) {
      return jsonResponse({
        data: {
          portfolios: [{ id: 1, name: "Main Portfolio", total_equity: money(150000) }],
        },
      });
    }
    if (url.includes("/api/v2/summary")) {
      return jsonResponse({ data: { total_market_value: money(250000), property_count: 1 } });
    }
    if (url.includes("/api/v2/banking/accounts")) {
      return jsonResponse({
        data: [
          { id: 5, type: "account", attributes: { balance: money(45678), mask: "1234", account_type: "checking" } },
        ],
      });
    }
    // PUT /api/transactions/{id} (web3 update: recategorize / reassign)
    const put = /\/api\/transactions\/(\d+)$/.exec(url);
    if (put && (init?.method ?? "GET") === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { transaction?: Record<string, unknown> };
      const t = body.transaction ?? {};
      return jsonResponse({
        id: Number(put[1]),
        name: "Rent",
        amount: money(-1),
        transaction_date: "2026-06-13",
        transaction_category_id: t["transaction_category_id"] ?? 100,
        property_id: t["property_id"] ?? 10,
        transaction_category: { category: "Mortgages & Loans", sub_category: "Mortgage Payment" },
        property: { id: 10, name: "Evergreen Terrace" },
      });
    }
    // GET /api/v2/transactions (web3 list: { transactions: [...] })
    if (url.includes("/api/v2/transactions") && !url.includes("transactions_summary")) {
      return jsonResponse({
        transactions: [
          {
            id: 7001,
            name: "ZZ rent",
            amount: money(1200),
            transaction_date: "2026-06-01",
            transaction_category_id: 100,
            property_id: 10,
            property: { id: 10, name: "Evergreen Terrace" },
          },
        ],
        total_pages: 1,
        total_count: 1,
      });
    }
    return jsonResponse({ data: [] });
  }) as typeof fetch;
}

async function connectedClient(options?: {
  tokenProvider?: { getToken(): Promise<string | null>; onTokenRejected(): Promise<void> };
  interactiveLogin?: () => Promise<boolean>;
}) {
  const stessaClient = new StessaClient(
    (options?.tokenProvider as never) ?? new StaticTokenProvider("test-token"),
    { fetch: fakeStessa() },
  );
  const server = createServer(stessaClient, { interactiveLogin: options?.interactiveLogin });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const signedOutProvider = {
  getToken: () => Promise.resolve<string | null>(null),
  onTokenRejected: () => Promise.resolve(),
};

describe("stessa-mcp server", () => {
  it("exposes the core read tools, the escape hatch, and resources", async () => {
    const client = await connectedClient();
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const expected of [
      "get_user",
      "list_portfolios",
      "get_summary",
      "list_properties",
      "get_property",
      "list_bank_accounts",
      "list_documents",
      "list_tenancies",
      "get_transactions_summary",
      "list_transaction_categories",
      "list_transactions",
      "recategorize_transaction",
      "assign_transaction_to_property",
      "create_transaction",
      "delete_transactions",
      "stessa_request",
    ]) {
      expect(names).toContain(expected);
    }
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain("stessa://guide");
    expect(uris).toContain("stessa://catalog");
  });

  it("list_properties flattens money and resolves the portfolio name reference", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_properties", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    const payload = JSON.parse(text) as {
      count: number;
      data: Array<{ id: number; marketValue: { amount: number }; portfolioId: number }>;
      references: Record<string, Record<string, string>>;
    };
    expect(payload.count).toBe(1);
    expect(payload.data[0]!.marketValue.amount).toBe(250000);
    expect(payload.references["portfolios"]).toEqual({ "1": "Main Portfolio" });
  });

  it("get_summary returns the dashboard payload", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_summary", arguments: {} });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      data: { property_count: number };
    };
    expect(payload.data.property_count).toBe(1);
  });

  it("list_bank_accounts flattens Unit JSON:API attributes and money", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_bank_accounts", arguments: {} });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      data: Array<{ id: number; balance: { amount: number }; mask: string }>;
    };
    expect(payload.data[0]!.balance.amount).toBe(45678);
    expect(payload.data[0]!.mask).toBe("1234");
  });

  it("list_transactions flattens the web3 { transactions: [...] } envelope and resolves the property", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_transactions", arguments: {} });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      count: number;
      data: Array<{ id: number; amount: { amount: number }; propertyId: number }>;
      references: Record<string, Record<string, string>>;
    };
    expect(payload.count).toBe(1);
    expect(payload.data[0]!.amount.amount).toBe(1200);
    expect(payload.references["properties"]).toEqual({ "10": "742 Evergreen Terrace" });
  });

  it("recategorize_transaction PUTs the new category and returns the updated txn", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "recategorize_transaction",
      arguments: { transactionId: 7001, categoryId: 150 },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      updated: boolean;
      transaction: { id: number; categoryId: number; categoryName: string };
    };
    expect(payload.updated).toBe(true);
    expect(payload.transaction.id).toBe(7001);
    expect(payload.transaction.categoryId).toBe(150);
    expect(payload.transaction.categoryName).toBe("Mortgage Payment");
  });

  it("assign_transaction_to_property PUTs the new property", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "assign_transaction_to_property",
      arguments: { transactionId: 7001, propertyId: 10 },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      updated: boolean;
      transaction: { propertyId: number; propertyName: string };
    };
    expect(payload.updated).toBe(true);
    expect(payload.transaction.propertyId).toBe(10);
    expect(payload.transaction.propertyName).toBe("Evergreen Terrace");
  });

  it("stessa_request reaches an arbitrary endpoint", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "stessa_request",
      arguments: { method: "GET", path: "/api/v2/summary" },
    });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      data: { property_count: number };
    };
    expect(payload.data.property_count).toBe(1);
  });

  it("returns a sign-in hint (stessa_login) when not signed in", async () => {
    const client = await connectedClient({
      tokenProvider: signedOutProvider,
      interactiveLogin: () => Promise.resolve(true),
    });
    const result = await client.callTool({ name: "list_properties", arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(result.isError).toBe(true);
    expect(text).toContain("not signed in");
    expect(text).toContain("stessa_login");
  });

  it("stessa_login is only registered when an interactive login is available", async () => {
    const withLogin = await connectedClient({ interactiveLogin: () => Promise.resolve(true) });
    const without = await connectedClient();
    expect((await withLogin.listTools()).tools.map((t) => t.name)).toContain("stessa_login");
    expect((await without.listTools()).tools.map((t) => t.name)).not.toContain("stessa_login");
  });
});
