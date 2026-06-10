import type { Session } from "./session-types.js";
import { selectRelaysForCommunity } from "./bootstrap-relays.js";

const KEY = "aethelos-session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.publicKeyHex || !parsed.namespaceId) return null;
    return {
      publicKeyHex: parsed.publicKeyHex,
      displayName: parsed.displayName ?? "",
      namespaceId: parsed.namespaceId,
      relayUrls:
        Array.isArray(parsed.relayUrls) && parsed.relayUrls.length > 0
          ? parsed.relayUrls
          : selectRelaysForCommunity(parsed.namespaceId),
    };
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
