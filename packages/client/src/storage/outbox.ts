import type { WireEnvelope } from "@aethelos/core";

const DB_NAME = "aethelos-outbox";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "namespaceId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadOutbox(namespaceId: string): Promise<WireEnvelope[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(namespaceId);
    req.onsuccess = () => {
      const row = req.result as
        | { namespaceId: string; envelopes: WireEnvelope[] }
        | undefined;
      resolve(row?.envelopes ?? []);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveOutbox(
  namespaceId: string,
  envelopes: WireEnvelope[],
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ namespaceId, envelopes });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
