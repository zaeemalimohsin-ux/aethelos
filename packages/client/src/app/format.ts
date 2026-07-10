import { formatPointsAmount } from "@aethelos/core";

/** Canonical Ed25519 public key: 32 bytes as lowercase hex (64 chars). */
export function isValidPublicKeyHex(key: string): boolean {
  return /^[0-9a-f]{64}$/i.test(key.trim());
}

export function shortKey(key: string, len = 8): string {
  if (!key) return "";
  if (key.length <= len * 2) return key;
  return `${key.slice(0, len)}…${key.slice(-4)}`;
}

export function formatPts(value: bigint): string {
  const formatted = formatPointsAmount(value);
  const parts = formatted.split(".");
  const p0 = parts[0] || "0";
  if (parts.length === 1 || !parts[1]) return p0;
  const decimals = parts[1].slice(0, 2).replace(/0+$/, "");
  return decimals ? `${p0}.${decimals}` : p0;
}
