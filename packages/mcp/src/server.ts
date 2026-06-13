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
    "get_report_data",
    {
      description:
        "Get tabular report data - the source for broad transaction listings. Accepts scope and date filters.",
      inputSchema: {
        ...scopeParams,
        dateGte: z.string().optional().describe("Start date filter (yyyy-MM-dd)"),
        dateLte: z.string().optional().describe("End date filter (yyyy-MM-dd)"),
      },
    },
    async ({ portfolioId, propertyId, unitId, dateGte, dateLte }) => {
      try {
        const filters: Record<string, string> = {};
        if (dateGte) filters["date_gte"] = dateGte;
        if (dateLte) filters["date_lte"] = dateLte;
        return toolSuccess(
          await client.transactions.reportData({
            scope: buildScope({ portfolioId, propertyId, unitId }),
            filters,
          }),
        );
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
