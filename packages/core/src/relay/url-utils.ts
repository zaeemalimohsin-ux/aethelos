const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function relayHost(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/^wss?:\/\/([^/:?#]+)/i);
  if (!match) return null;
  return match[1]!.toLowerCase();
}

/** True when the relay URL only works on this machine (not for remote invite links). */
export function isLocalOnlyRelayUrl(url: string): boolean {
  const host = relayHost(url);
  if (!host) return false;
  return LOCAL_HOSTS.has(host);
}

/** Relay URLs suitable for signed invite links — excludes localhost-only entries. */
export function filterRemoteRelayUrls(relayUrls: string[]): string[] {
  return [...new Set(relayUrls.filter((u) => !isLocalOnlyRelayUrl(u)))];
}
