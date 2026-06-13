import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StessaClient, type StessaAuthTokenProvider } from "stessa-client";
import { EntityCache } from "./entityCache.js";
import { enrich } from "./entityEnricher.js";
import { GUIDE } from "./guide.js";
import { CATALOG } from "./catalog.js";
import { VERSION } from "./version.js";
import { maxResultsParam, toolError, toolSuccess } from "./tools/helpers.js";
import { registerGenericTools } from "./tools/generic.js";

export interface ServerOptions {
  /**
   * When provided, the stessa_login tool is registered. The callback runs the
   * interactive browser sign-in and resolves true once tokens were obtained.
   */
  interactiveLogin?: (() => Promise<boolean>) | undefined;
}

type Row = Record<string, unknown>;

const scopeParams = {
  portfolioId: z.number().int().optional().describe("Scope to a portfolio ID"),
  propertyId: z.number().int().optional().describe("Scope to a property ID"),
  unitId: z.number().int().optional().describe("Scope to a unit ID"),
};

function buildScope(args: {
  portfolioId?: number | undefined;
  propertyId?: number | undefined;
  unitId?: number | undefined;
}): Record<string, number> {
  const scope: Record<string, number> = {};
  if (args.portfolioId !== undefined) scope["portfolio_id"] = args.portfolioId;
  if (args.propertyId !== undefined) scope["property_id"] = args.propertyId;
  if (args.unitId !== undefined) scope["unit_id"] = args.unitId;
  return scope;
}

export function createServer(client: StessaClient, options: ServerOptions = {}): McpServer {
  const cache = new EntityCache(client);
  const server = new McpServer({ name: "stessa-mcp", version: VERSION });

  if (options.interactiveLogin) {
    const interactiveLogin = options.interactiveLogin;
    server.registerTool(
      "stessa_login",
      {
        description:
          "Open a browser window for the user to sign in to Stessa. Use when other tools fail with HTTP 401 / not signed in. TELL THE USER a sign-in window is about to open BEFORE calling this; the call waits (up to several minutes) while they complete the Auth0 sign-in, then reports success.",
        inputSchema: {},
      },
      async () => {
        try {
          const existing = await client.getUserInfo().catch(() => null);
          if (existing) {
            return toolSuccess({ alreadySignedIn: true, user: existing });
          }
          const ok = await interactiveLogin();
          if (!ok) {
            return toolError(
              'Sign-in was not completed: the window was closed, timed out, or no Chromium browser was found. The user can also run "stessa-mcp login" in a terminal and retry.',
            );
          }
          const user = await client.getUserInfo().catch(() => null);
          return toolSuccess({ signedIn: true, user });
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }

  server.registerTool(
    "get_user",
    {
      description: "Get the currently signed-in Stessa user and account context (from the app sidebar).",
      inputSchema: {},
    },
    async () => {
      try {
        const user = await client.getUserInfo();
        if (!user) {
          return toolError("No user info available. You may not be authenticated.");
        }
        return toolSuccess(user);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_portfolios",
    {
      description:
        "List portfolios with rolled-up totals (market value, loan balance, equity, acquisition price).",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.portfolios.list();
        return toolSuccess({ data, count: data.length });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_summary",
    {
      description: "Get the Stessa dashboard summary (portfolio-level financial metrics).",
      inputSchema: {},
    },
    async () => {
      try {
        return toolSuccess(await client.portfolios.summary());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_properties",
    {
      description: "List rental properties with address, value, loan balance, and equity.",
      inputSchema: { portfolioId: scopeParams.portfolioId, maxResults: maxResultsParam },
    },
    async ({ portfolioId, maxResults }) => {
      try {
        const scope = buildScope({ portfolioId });
        const data = await client.properties.list({
          scope,
          perPage: maxResults ?? 100,
        });
        const result = await enrich(
          { data: data as unknown as Row[], count: data.length },
          cache,
        );
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_property",
    {
      description: "Get a single property by its numeric ID.",
      inputSchema: { id: z.number().int().describe("Property ID") },
    },
    async ({ id }) => {
      try {
        const property = await client.properties.get(id);
        if (!property) {
          return toolError(`Property ${id} not found.`);
        }
        return toolSuccess(property);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_bank_accounts",
    {
      description: "List linked bank accounts (balances, masks, institutions).",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.banking.accounts();
        return toolSuccess({ data, count: data.length });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_documents",
    {
      description: "List documents (uploaded files tagged to properties/units/portfolios).",
      inputSchema: { ...scopeParams, maxResults: maxResultsParam },
    },
    async ({ portfolioId, propertyId, unitId, maxResults }) => {
      try {
        const data = await client.documents.list({
          scope: buildScope({ portfolioId, propertyId, unitId }),
          perPage: maxResults ?? 100,
        });
        const result = await enrich(
          { data: data as unknown as Row[], count: data.length },
          cache,
        );
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_tenancies",
    {
      description: "List tenancies (lease/tenant arrangements) with their properties and rent setup.",
      inputSchema: { ...scopeParams },
    },
    async ({ portfolioId, propertyId, unitId }) => {
      try {
        const data = await client.tenancies.list({
          scope: buildScope({ portfolioId, propertyId, unitId }),
        });
        const result = await enrich(
          { data: data as unknown as Row[], count: data.length },
          cache,
        );
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_scheduled_incomes",
    {
      description: "List scheduled (expected) rent incomes, optionally scoped to a property/portfolio.",
      inputSchema: { ...scopeParams },
    },
    async ({ portfolioId, propertyId, unitId }) => {
      try {
        return toolSuccess(await client.tenancies.scheduledIncomes(buildScope({ portfolioId, propertyId, unitId })));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_transactions_summary",
    {
      description: "Get income/expense rollups for transactions, optionally scoped to a property/portfolio.",
      inputSchema: { ...scopeParams },
    },
    async ({ portfolioId, propertyId, unitId }) => {
      try {
        return toolSuccess(await client.transactions.summary(buildScope({ portfolioId, propertyId, unitId })));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_transaction_categories",
    {
      description: "List the transaction categories used to classify income and expenses.",
      inputSchema: {},
    },
    async () => {
      try {
        return toolSuccess(await client.transactions.categories());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "List transactions (income/expense lines) with category, property, amount, and date. Use 'search' to match by description, 'deleted' to view Trash. Each item's id is what recategorize_transaction and assign_transaction_to_property take.",
      inputSchema: {
        search: z.string().optional().describe("Match transactions by description text"),
        deleted: z.boolean().optional().describe("Show trashed transactions instead of active ones"),
        needsReview: z.boolean().optional().describe("Only transactions that need review"),
        page: z.number().int().positive().optional().describe("Page number (default 1)"),
        maxResults: maxResultsParam,
      },
    },
    async ({ search, deleted, needsReview, page, maxResults }) => {
      try {
        const data = await client.transactions.listAll(maxResults ?? 100, {
          ...(page !== undefined ? { page } : {}),
          ...(search !== undefined ? { searchQuery: search } : {}),
          ...(deleted !== undefined ? { deleted } : {}),
          ...(needsReview !== undefined ? { needsReview } : {}),
        });
        const result = await enrich({ data: data as unknown as Row[], count: data.length }, cache);
        return toolSuccess(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "recategorize_transaction",
    {
      description:
        "Change a transaction's category. Pass the transaction id and the target category id (transaction_category_id from list_transaction_categories). Edits real financial records - confirm with the user first.",
      inputSchema: {
        transactionId: z.number().int().describe("Transaction id"),
        categoryId: z.number().int().describe("Target transaction_category_id"),
      },
    },
    async ({ transactionId, categoryId }) => {
      try {
        const updated = await client.transactions.recategorize(transactionId, categoryId);
        return toolSuccess({ updated: true, transaction: updated });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "assign_transaction_to_property",
    {
      description:
        "Assign (or move) a transaction to a property. Pass the transaction id and the target property id (from list_properties). Edits real financial records - confirm with the user first.",
      inputSchema: {
        transactionId: z.number().int().describe("Transaction id"),
        propertyId: z.number().int().describe("Target property id"),
      },
    },
    async ({ transactionId, propertyId }) => {
      try {
        const updated = await client.transactions.assignToProperty(transactionId, propertyId);
        return toolSuccess({ updated: true, transaction: updated });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "create_transaction",
    {
      description:
        "Create a manual transaction. amount is in dollars; use a negative amount (or moneyIn=false) for an expense. Optionally set category and property. Edits real financial records - confirm with the user first.",
      inputSchema: {
        name: z.string().describe("Description / payee"),
        date: z.string().describe("Transaction date (yyyy-MM-dd)"),
        amount: z.number().describe("Amount in dollars; negative = money out / expense"),
        categoryId: z.number().int().optional().describe("transaction_category_id"),
        propertyId: z.number().int().optional().describe("Property id"),
        notes: z.string().optional().describe("Notes"),
      },
    },
    async ({ name, date, amount, categoryId, propertyId, notes }) => {
      try {
        const created = await client.transactions.create({
          name,
          transactionDate: date,
          amountCents: Math.round(amount * 100),
          moneyIn: amount > 0,
          transactionCategoryId: categoryId ?? null,
          propertyId: propertyId ?? null,
          notes: notes ?? null,
        });
        return toolSuccess({ created: true, transaction: created });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_transactions",
    {
      description:
        "Move one or more transactions to Trash (soft delete; Stessa auto-purges Trash after 30 days, there is no immediate hard delete). Pass the transaction ids. Edits real financial records - confirm with the user first.",
      inputSchema: {
        transactionIds: z.array(z.number().int()).min(1).describe("Transaction ids to delete"),
      },
    },
    async ({ transactionIds }) => {
      try {
        await client.transactions.delete(transactionIds);
        return toolSuccess({ deleted: true, ids: transactionIds, note: "Moved to Trash (auto-purges after 30 days)." });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerGenericTools(server, client);

  server.registerResource(
    "guide",
    "stessa://guide",
    {
      title: "Stessa Tool Usage Guide",
      description: "Guide for using Stessa tools: entities, fields, conventions, and the escape hatch.",
      mimeType: "text/markdown",
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }] }),
  );

  server.registerResource(
    "catalog",
    "stessa://catalog",
    {
      title: "Stessa API endpoint catalog",
      description: "Grouped list of API endpoint paths, for use with the stessa_request escape-hatch tool.",
      mimeType: "text/markdown",
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: CATALOG }] }),
  );

  server.registerResource(
    "property",
    new ResourceTemplate("stessa://property/{id}", { list: undefined }),
    {
      title: "Property details by ID",
      description: "Look up a property by its numeric ID. Returns name, address, value, and equity.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const property = await cache.getProperty(Number(id));
      const text = property ? JSON.stringify(property) : `property ${String(id)} not found`;
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  server.registerResource(
    "portfolio",
    new ResourceTemplate("stessa://portfolio/{id}", { list: undefined }),
    {
      title: "Portfolio details by ID",
      description: "Look up a portfolio by its numeric ID. Returns name and rolled-up totals.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const portfolio = await cache.getPortfolio(Number(id));
      const text = portfolio ? JSON.stringify(portfolio) : `portfolio ${String(id)} not found`;
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  return server;
}

export async function runServer(tokenProvider: StessaAuthTokenProvider): Promise<void> {
  // Providers that support an on-demand browser sign-in (CdpTokenProvider) get
  // the stessa_login tool; detected structurally to avoid a hard dependency on
  // the cdp subpath.
  const loginCapable = tokenProvider as StessaAuthTokenProvider & {
    interactiveLogin?: (signal?: AbortSignal) => Promise<unknown>;
  };
  const interactiveLogin =
    typeof loginCapable.interactiveLogin === "function"
      ? async () => (await loginCapable.interactiveLogin!()) != null
      : undefined;
  const server = createServer(new StessaClient(tokenProvider), { interactiveLogin });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
