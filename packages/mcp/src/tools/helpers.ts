import { z } from "zod";
import { StessaClientError } from "stessa-client";

export function toolSuccess(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

let signInHint =
  "Tell them, then offer to open a browser sign-in window via the stessa_login tool. " +
  'Alternatively they can run "stessa-mcp login" in a terminal and retry.';

/** Override the guidance appended to 401 errors (the hosted server points users at re-pairing). */
export function setSignInHint(hint: string): void {
  signInHint = hint;
}

export function toolError(error: unknown) {
  if (error instanceof StessaClientError && error.httpStatus === 401) {
    return {
      content: [
        {
          type: "text" as const,
          text: `${error.message} (HTTP 401). The user is not signed in to Stessa. ${signInHint}`,
        },
      ],
      isError: true,
    };
  }
  const message =
    error instanceof StessaClientError
      ? `${error.message} (HTTP ${error.httpStatus})`
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export const maxResultsParam = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Maximum number of results to return (default 100)");

/** Drop undefined values so we only send fields the caller actually set. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
