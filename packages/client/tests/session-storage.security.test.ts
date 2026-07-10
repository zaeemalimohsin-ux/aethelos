import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSession,
  saveSession,
  clearSession,
  STORAGE_KEYS,
} from "../src/app/session-storage.js";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

describe("session-storage security", () => {
  beforeEach(() => {
    installLocalStorage();
    clearSession();
  });

  it("loadSession returns null for poisoned JSON", () => {
    localStorage.setItem(STORAGE_KEYS.session, "{not json");
    expect(loadSession()).toBeNull();
  });

  it("loadSession rejects session missing publicKeyHex", () => {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ namespaceId: "abc" }));
    expect(loadSession()).toBeNull();
  });

  it("loadSession rejects session missing namespaceId", () => {
    localStorage.setItem(
      STORAGE_KEYS.session,
      JSON.stringify({ publicKeyHex: "a".repeat(64) }),
    );
    expect(loadSession()).toBeNull();
  });

  it("loadSession preserves ignoredCommunityRelays when valid", () => {
    saveSession({
      publicKeyHex: "a".repeat(64),
      displayName: "Alice",
      namespaceId: "ns-1",
      relayUrls: ["ws://localhost:8787"],
      ignoredCommunityRelays: ["ws://evil.example/ws"],
    });
    const loaded = loadSession();
    expect(loaded?.ignoredCommunityRelays).toEqual(["ws://evil.example/ws"]);
  });
});
