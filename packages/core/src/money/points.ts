import type { Points } from "../schema/primitives.js";

/** Smallest unit scale: 1 Point = POINTS_SCALE internal units. */
export const POINTS_SCALE = 1_000_000_000n;
export const POINTS_DECIMALS = 9;

const POINTS_AMOUNT_RE = /^\d+(\.\d{1,9})?$/;

/** Wire-format validator for human-readable Point amounts (up to 9 decimal places). */
export function isValidPointsAmountString(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  if (!POINTS_AMOUNT_RE.test(v)) return false;
  try {
    parsePointsAmount(v);
    return true;
  } catch {
    return false;
  }
}

/** Parse a human-readable amount string into scaled internal Points. */
export function parsePointsAmount(input: string): Points {
  const trimmed = input.trim();
  if (!POINTS_AMOUNT_RE.test(trimmed)) {
    throw new Error("invalid_points_amount");
  }

  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw || "0");
  const fracPadded = fracRaw.padEnd(POINTS_DECIMALS, "0").slice(0, POINTS_DECIMALS);
  const frac = BigInt(fracPadded || "0");
  const amount = whole * POINTS_SCALE + frac;
  if (amount <= 0n) {
    throw new Error("invalid_points_amount");
  }
  return amount;
}

export interface FormatPointsOptions {
  maxDecimals?: number;
  trimTrailingZeros?: boolean;
}

/** Format scaled internal Points as a human-readable decimal string. */
export function formatPointsAmount(
  amount: Points,
  opts: FormatPointsOptions = {},
): string {
  const { maxDecimals = POINTS_DECIMALS, trimTrailingZeros = true } = opts;
  if (amount <= 0n) return "0";

  const scale = POINTS_SCALE;
  const whole = amount / scale;
  const frac = amount % scale;
  if (frac === 0n) return whole.toString();

  let fracStr = frac.toString().padStart(POINTS_DECIMALS, "0");
  if (maxDecimals < POINTS_DECIMALS) {
    fracStr = fracStr.slice(0, maxDecimals);
  }
  if (trimTrailingZeros) {
    fracStr = fracStr.replace(/0+$/, "");
  }
  if (fracStr.length === 0) return whole.toString();
  return `${whole}.${fracStr}`;
}

/** Test helper: parse human amount shorthand. */
export function points(human: string): Points {
  return parsePointsAmount(human);
}

export function tryParsePointsAmount(input: string): Points | null {
  try {
    return parsePointsAmount(input);
  } catch {
    return null;
  }
}
