import { formatPointsAmount } from "@aethelos/core";

export function shortKey(key: string, len = 8): string {
  if (!key) return "";
  if (key.length <= len * 2) return key;
  return `${key.slice(0, len)}…${key.slice(-4)}`;
}

export function displayNameFor(
  pool: import("@aethelos/core").PoolState | null,
  key: string,
  names: Record<string, string>,
): string {
  const name = names[key];
  if (name) return name;
  return shortKey(key);
}

export function pts(value: bigint | number): string {
  if (typeof value === "number") return `${value} pts`;
  return `${formatPointsAmount(value)} pts`;
}

export function formatPts(value: bigint): string {
  return formatPointsAmount(value);
}
