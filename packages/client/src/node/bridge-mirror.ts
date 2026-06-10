import type { KeyPair, PoolState, SignedEvent } from "@aethelos/core";
import { isBridge } from "@aethelos/core";
import { SyncEngine } from "../sync/engine.js";

const mirroredStorageKey = (namespaceId: string) =>
  `aethelos-bridge-mirrored-${namespaceId}`;

const MIRROR_EVENT_TYPES = new Set(["bridge_transaction", "relay_cell_governance"]);

function loadMirroredIds(namespaceId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(mirroredStorageKey(namespaceId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveMirroredIds(namespaceId: string, ids: Set<string>): void {
  sessionStorage.setItem(mirroredStorageKey(namespaceId), JSON.stringify([...ids]));
}

function mirrorTarget(pool: PoolState, event: SignedEvent): string | null {
  const payload = event.payload;
  if (payload.type === "bridge_transaction") {
    if (pool.members.includes(payload.to)) return null;
    const remoteId = payload.superstructureId;
    if (pool.parentSuperstructures.includes(remoteId)) return remoteId;
    if ((pool.childCells ?? []).includes(remoteId)) return remoteId;
    return null;
  }
  if (payload.type === "relay_cell_governance") {
    if (payload.cellId !== pool.namespaceId) return null;
    const parent = pool.parentSuperstructures.at(-1);
    return parent ?? null;
  }
  return null;
}

/**
 * When this node holds the bridge role, mirror seam events into linked namespaces.
 */
export class BridgeMirrorCoordinator {
  private remoteEngines = new Map<string, SyncEngine>();
  private mirroredIds = new Set<string>();
  private activeNamespaceId = "";

  getRemoteEngine(namespaceId: string): SyncEngine | undefined {
    return this.remoteEngines.get(namespaceId);
  }

  async syncLinkedNamespaces(
    pool: PoolState,
    keyPair: KeyPair,
    relayUrls: string[],
    myKey: string,
  ): Promise<void> {
    this.activeNamespaceId = pool.namespaceId;
    if (!isBridge(pool, myKey)) {
      this.stop();
      return;
    }

    if (this.mirroredIds.size === 0) {
      this.mirroredIds = loadMirroredIds(pool.namespaceId);
    }

    const linked = [...pool.parentSuperstructures, ...(pool.childCells ?? [])];
    const linkedSet = new Set(linked);

    for (const ns of linked) {
      if (!this.remoteEngines.has(ns)) {
        const engine = new SyncEngine(relayUrls, ns, keyPair);
        await engine.start();
        this.remoteEngines.set(ns, engine);
      }
    }

    for (const ns of [...this.remoteEngines.keys()]) {
      if (!linkedSet.has(ns)) {
        this.remoteEngines.get(ns)?.disconnect();
        this.remoteEngines.delete(ns);
      }
    }
  }

  async mirrorOutboundEvents(
    pool: PoolState,
    events: SignedEvent[],
    myKey: string,
  ): Promise<void> {
    if (!isBridge(pool, myKey)) return;

    let changed = false;

    for (const event of events) {
      if (event.namespaceId !== pool.namespaceId) continue;
      if (event.author !== myKey) continue;
      if (!MIRROR_EVENT_TYPES.has(event.payload.type)) continue;
      if (this.mirroredIds.has(event.id)) continue;

      const remoteId = mirrorTarget(pool, event);
      if (!remoteId) continue;

      const engine = this.remoteEngines.get(remoteId);
      if (!engine) continue;

      if (event.payload.type === "bridge_transaction") {
        const payload = event.payload;
        await engine.publish({
          namespaceId: remoteId,
          prevHash: null,
          lamport: 0,
          author: myKey,
          timestamp: event.timestamp,
          payload: {
            type: "bridge_transaction",
            superstructureId: pool.namespaceId,
            localProposalId: event.id,
            to: payload.to,
            amount: payload.amount,
          },
        });
      } else if (event.payload.type === "relay_cell_governance") {
        const payload = event.payload;
        await engine.publish({
          namespaceId: remoteId,
          prevHash: null,
          lamport: 0,
          author: myKey,
          timestamp: event.timestamp,
          payload: {
            type: "relay_cell_governance",
            cellId: pool.namespaceId,
            parameters: payload.parameters,
            population: payload.population,
          },
        });
      }

      this.mirroredIds.add(event.id);
      changed = true;
    }

    if (changed) {
      saveMirroredIds(pool.namespaceId, this.mirroredIds);
    }
  }

  stop(): void {
    for (const engine of this.remoteEngines.values()) {
      engine.disconnect();
    }
    this.remoteEngines.clear();
    if (this.activeNamespaceId) {
      saveMirroredIds(this.activeNamespaceId, this.mirroredIds);
    }
  }
}
