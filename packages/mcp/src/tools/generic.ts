import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HttpMethod, StessaClient } from "stessa-client";
import { toolError, toolSuccess } from "./helpers.js";

/**
 * Escape hatch covering every endpoint in the Stessa API catalog that has no
 * dedicated tool. Paths are relative to https://app.stessa.com (e.g.
 * "/api/v2/properties"). Core responses are wrapped in `{ data: ... }`.
 */
export function registerGenericTools(server: McpServer, client: StessaClient): void {
  server.registerTool(
    "stessa_request",
    {
      description:
        "Low-level authenticated request to any Stessa API endpoint (escape hatch for resources without a dedicated tool). " +
        "Paths are relative to https://app.stessa.com (e.g. '/api/v2/properties', '/api/v2/summary', '/api/v2/banking/accounts'). " +
        "Most reads are GET and return a { data: ... } envelope. See the stessa://catalog and stessa://guide resources for the endpoint list. " +
        "Be careful with banking POSTs (transfers, card creation): they move real money.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
        path: z
          .string()
          .describe("Endpoint path, e.g. '/api/v2/properties' or '/api/v2/banking/accounts/123'"),
        query: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Optional query parameters, e.g. { "portfolio_id": 1, "page": 1 }'),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Request body for POST/PUT/PATCH"),
      },
    },
    async ({ method, path, query, body }) => {
      try {
        const result = await client.request(method as HttpMethod, path, {
          query: query as Record<string, string | number | boolean> | undefined,
          body,
        });
        return toolSuccess(result ?? { ok: true });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
