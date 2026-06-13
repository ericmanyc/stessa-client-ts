/**
 * Parse helpers for Stessa's JSON: ids that may be numbers or strings, money
 * encoded as `{ cents, currency_iso }`, and dates in ISO / `yyyy-MM-dd` form.
 */

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  throw new Error(`Cannot convert ${JSON.stringify(value)} to a number`);
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  try {
    return toNumber(value);
  } catch {
    return null;
  }
}

export function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

export function toBoolean(value: unknown): boolean {
  return Boolean(value);
}

/**
 * Stessa money is always `{ cents: number, currency_iso: string }`. This
 * flattens it to a convenient shape; `amount` is the value in major units
 * (dollars), `cents` is preserved for exact arithmetic.
 */
export interface Money {
  cents: number;
  amount: number;
  currency: string;
}

export function parseMoney(value: unknown): Money | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return { cents: Math.round(value * 100), amount: value, currency: "USD" };
  }
  if (typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const centsRaw = raw["cents"];
    if (centsRaw !== undefined && centsRaw !== null) {
      const cents = toNumber(centsRaw);
      return {
        cents,
        amount: cents / 100,
        currency: String(raw["currency_iso"] ?? raw["currency"] ?? "USD"),
      };
    }
  }
  return null;
}

/**
 * Build Money from a bare integer cents value (e.g. `rent_amount_cents`,
 * `current_balance_cents`). Unlike `parseMoney`, which treats a bare number as
 * dollars, this treats the number as cents.
 */
export function moneyFromCents(value: unknown): Money | null {
  const cents = toNumberOrNull(value);
  if (cents === null) {
    return null;
  }
  return { cents, amount: cents / 100, currency: "USD" };
}

const ISO_DATE = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/;

/** Parses Stessa date strings: `yyyy-MM-dd` (local) or full ISO 8601 datetimes. */
export function parseStessaDate(value: unknown): Date {
  const result = parseStessaDateOrNull(value);
  if (result === null) {
    throw new Error(`Unknown date format for ${JSON.stringify(value)}`);
  }
  return result;
}

export function parseStessaDateOrNull(value: unknown): Date | null {
  // Absent dates come back inconsistently: null, "", or [] (a PHP empty-array
  // quirk). Treat any non-string or blank value as "no date".
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const iso = ISO_DATE.exec(value);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Case-insensitive property lookup; Stessa mixes snake_case and camelCase. */
export function pick(raw: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (name in raw) {
      return raw[name];
    }
  }
  const lower = new Map(Object.keys(raw).map((k) => [k.toLowerCase(), k]));
  for (const name of names) {
    const actual = lower.get(name.toLowerCase());
    if (actual !== undefined) {
      return raw[actual];
    }
  }
  return undefined;
}
