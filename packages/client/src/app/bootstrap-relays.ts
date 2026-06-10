import { fileBootstrapRelays } from "./bootstrap-relays.default.js";

const FILE_BOOTSTRAP_RELAYS: string[] = fileBootstrapRelays();

const DEFAULT_PICK_COUNT = 3;
const PROBE_TIMEOUT_MS = 4000;

function parseRelayList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === "string" && u.length > 0);
      }
    } catch {
      return [];
    }
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function envBootstrapRelays(): string[] {
  const raw = import.meta.env.VITE_BOOTSTRAP_RELAYS;
  if (typeof raw !== "string") return [];
  return parseRelayList(raw);
}

function companionRelay(): string | null {
  const raw = import.meta.env.VITE_DEFAULT_RELAY_URL;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return raw.trim();
}

export function dedupeRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Silent fallback pool when no community member has published a mailbox yet.
 * Primary connectivity comes from peer `relay_contribute` URLs on the ledger.
 * Dev: localhost only. Prod: companion relay + env + checked-in operator slots.
 */
export function getBootstrapRelayPool(): string[] {
  if (import.meta.env.DEV) {
    return ["ws://localhost:8787"];
  }
  const companion = companionRelay();
  return dedupeRelays([
    ...(companion ? [companion] : []),
    ...envBootstrapRelays(),
    ...FILE_BOOTSTRAP_RELAYS,
  ]);
}

/** Fallback when the bootstrap pool is empty (misconfigured prod build). */
export function defaultRelay(): string {
  const companion = companionRelay();
  if (companion) return companion;
  return "ws://localhost:8787";
}

export function relayOperatorGuideUrl(): string {
  const configured = import.meta.env.VITE_RELAY_OPERATOR_GUIDE_URL;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return `${window.location.origin}${window.location.pathname.replace(/\/?$/, "/")}relay-guide.html`;
}

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashToUint32(digest: Uint8Array, wordIndex: number): number {
  const offset = (wordIndex * 4) % digest.length;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    n = (n << 8) | digest[(offset + i) % digest.length]!;
  }
  return n >>> 0;
}

function digestForSeed(seed: string): Uint8Array {
  const out = new Uint8Array(32);
  let h = fnv1a(seed);
  for (let i = 0; i < out.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i % seed.length), 0x01000193);
    out[i] = h & 0xff;
    h >>>= 8;
  }
  return out;
}

function orderedPoolIndices(namespaceId: string, pool: string[]): number[] {
  if (pool.length === 0) return [];
  const digest = digestForSeed(namespaceId);
  const indices: number[] = [];
  const used = new Set<number>();
  // The digest yields a limited number of distinct words; residues mod pool.length
  // can collide, so bound the draws and fill any leftovers sequentially.
  const maxDraws = pool.length * 4;
  for (let wordIndex = 0; used.size < pool.length && wordIndex < maxDraws; wordIndex++) {
    const idx = hashToUint32(digest, wordIndex) % pool.length;
    if (!used.has(idx)) {
      used.add(idx);
      indices.push(idx);
    }
  }
  for (let i = 0; i < pool.length; i++) {
    if (!used.has(i)) {
      used.add(i);
      indices.push(i);
    }
  }
  return indices;
}

/** Deterministic subset of the bootstrap pool — spreads communities across operators. */
export function pickBootstrapRelaysFromPool(
  namespaceId: string,
  pool: string[],
  count = DEFAULT_PICK_COUNT,
): string[] {
  if (pool.length === 0) return [];
  if (pool.length <= count) return [...pool];

  const indices = orderedPoolIndices(namespaceId, pool);
  return indices.slice(0, count).map((idx) => pool[idx]!);
}

export function pickBootstrapRelays(
  namespaceId: string,
  count = DEFAULT_PICK_COUNT,
): string[] {
  return pickBootstrapRelaysFromPool(namespaceId, getBootstrapRelayPool(), count);
}

export function relayHealthUrl(wsUrl: string): string | null {
  try {
    const parsed = new URL(wsUrl.trim());
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return null;
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/healthz";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Probe relay liveness via GET /healthz (optional genesis optimization). */
export async function probeRelay(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const healthUrl = relayHealthUrl(url);
  if (!healthUrl || typeof fetch === "undefined") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface RelaySelectionOptions {
  customRelay?: string;
  bootstrapCount?: number;
  /** Skip health probes (tests / offline). */
  probe?: boolean;
  /** @internal test override */
  poolOverride?: string[];
}

function mergeCustomRelay(custom: string | undefined, bootstrap: string[]): string[] {
  if (!custom) return bootstrap;
  return dedupeRelays([custom, ...bootstrap.filter((r) => r !== custom)]);
}

/**
 * Synchronous deterministic relay set for a community (join fallback, session restore).
 */
export function selectRelaysForCommunity(
  namespaceId: string,
  options: RelaySelectionOptions = {},
): string[] {
  const count = options.bootstrapCount ?? DEFAULT_PICK_COUNT;
  const pool = options.poolOverride ?? getBootstrapRelayPool();
  const bootstrap = pickBootstrapRelaysFromPool(namespaceId, pool, count);

  if (bootstrap.length > 0) {
    return mergeCustomRelay(options.customRelay?.trim(), bootstrap);
  }

  const custom = options.customRelay?.trim();
  if (custom) return [custom];
  if (import.meta.env.DEV) return [defaultRelay()];
  return [];
}

/**
 * Async relay resolution with optional health probes — used at genesis.
 */
export async function resolveRelaysForCommunity(
  namespaceId: string,
  options: RelaySelectionOptions = {},
): Promise<string[]> {
  const count = options.bootstrapCount ?? DEFAULT_PICK_COUNT;
  const pool = options.poolOverride ?? getBootstrapRelayPool();
  const custom = options.customRelay?.trim();
  const shouldProbe = options.probe === true;

  if (pool.length === 0) {
    if (custom) return [custom];
    if (import.meta.env.DEV) return [defaultRelay()];
    return [];
  }

  let bootstrap: string[] = [];
  const indices = orderedPoolIndices(namespaceId, pool);

  if (shouldProbe) {
    for (const idx of indices) {
      if (bootstrap.length >= count) break;
      const url = pool[idx]!;
      if (custom && url === custom) continue;
      if (await probeRelay(url)) bootstrap.push(url);
    }
  }

  if (bootstrap.length === 0) {
    bootstrap = pickBootstrapRelaysFromPool(namespaceId, pool, count);
  } else if (bootstrap.length < count) {
    for (const idx of indices) {
      if (bootstrap.length >= count) break;
      const url = pool[idx]!;
      if (!bootstrap.includes(url) && url !== custom) bootstrap.push(url);
    }
  }

  return mergeCustomRelay(custom, bootstrap.slice(0, count));
}

export function usesAutomaticBootstrapRelays(): boolean {
  return true;
}

/** True when prod builds have at least one fallback mailbox configured. */
export function isBootstrapPoolConfigured(): boolean {
  if (import.meta.env.DEV) return true;
  return getBootstrapRelayPool().length > 0;
}

export function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}
