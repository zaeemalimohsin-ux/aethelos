import type { SignedEvent } from "@aethelos/core";
import { filterCausalClosure, isValidSignedEvent, verifyEventSync } from "@aethelos/core";

const DB_NAME = "aethelos-eventlog";
const STORE = "events";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("namespaceId", "namespaceId", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function appendEvent(event: SignedEvent): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function appendEvents(events: SignedEvent[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const e of events) store.put(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadEvents(namespaceId: string): Promise<SignedEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("namespaceId");
    const req = index.getAll(namespaceId);
    req.onsuccess = () => resolve((req.result as SignedEvent[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function exportEventLog(namespaceId: string): Promise<string> {
  const events = await loadEvents(namespaceId);
  return JSON.stringify(events, null, 2);
}

/**
 * Import a JSON event log after structural validation, signature verification,
 * causal closure checks, and optional namespace filtering. Orphans / broken
 * chains are skipped; poison logs with nothing causally reachable throw.
 */
export async function importEventLog(
  json: string,
  namespaceId?: string,
): Promise<{ imported: number; skipped: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("invalid_json");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("invalid_log_format");
  }

  const valid: SignedEvent[] = [];
  let skipped = 0;
  for (const entry of parsed) {
    if (
      isValidSignedEvent(entry) &&
      verifyEventSync(entry) &&
      (!namespaceId || entry.namespaceId === namespaceId)
    ) {
      valid.push(entry);
    } else {
      skipped += 1;
    }
  }

  if (valid.length === 0) {
    throw new Error(parsed.length === 0 ? "empty_log" : "no_valid_entries");
  }

  const existing = namespaceId ? await loadEvents(namespaceId) : [];
  const existingIds = new Set(existing.map((e) => e.id));
  const alreadyKnown = valid.filter((e) => existingIds.has(e.id));
  const novel = valid.filter((e) => !existingIds.has(e.id));
  const { accepted, rejected } = filterCausalClosure(novel, existing);
  skipped += rejected.length + alreadyKnown.length;

  if (accepted.length === 0) {
    if (alreadyKnown.length > 0 && rejected.length === 0) {
      // Idempotent re-import of an already-stored causal log.
      return { imported: alreadyKnown.length, skipped: skipped - alreadyKnown.length };
    }
    throw new Error("causal_orphan_log");
  }

  await appendEvents(accepted);
  return { imported: accepted.length + alreadyKnown.length, skipped };
}
