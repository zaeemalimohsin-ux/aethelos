import "fake-indexeddb/auto";
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket =
    WebSocket as unknown as typeof WebSocket;
}

if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.sessionStorage = {
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
