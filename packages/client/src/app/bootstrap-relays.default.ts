/** Optional operator-provided fallback relays (same-origin /ws is primary in prod). */
export const DEFAULT_BOOTSTRAP_RELAYS: string[] = [];

export function fileBootstrapRelays(): string[] {
  return DEFAULT_BOOTSTRAP_RELAYS.filter((u) => u.length > 0);
}
