import type { KeyPair, PoolState } from "@aethelos/core";
import { reduceEvents } from "@aethelos/core";
import { SyncEngine } from "../sync/engine.js";

export type LinkedPools = Record<string, PoolState>;

/**
 * Read-only reducers for linked parent/child namespaces (same relays + keys).
 * Powers federation UI and join proposals without switching the active session.
 */
export class FederationReader {
  private engines = new Map<string, SyncEngine>();
  private pools: LinkedPools = {};
  private listener: ((pools: LinkedPools) => void) | null = null;

  onUpdate(listener: (pools: LinkedPools) => void): () => void {
    this.listener = listener;
    listener({ ...this.pools });
    return () => {
      this.listener = null;
    };
  }

  private emit(): void {
    this.listener?.({ ...this.pools });
  }

  async sync(pool: PoolState, keyPair: KeyPair, relayUrls: string[]): Promise<void> {
    const linked = [...pool.parentSuperstructures, ...(pool.childCells ?? [])];
    const linkedSet = new Set(linked);

    for (const ns of linked) {
      if (!this.engines.has(ns)) {
        const engine = new SyncEngine(relayUrls, ns, keyPair);
        engine.onEvents((events) => {
          this.pools[ns] = reduceEvents(ns, events);
          this.emit();
        });
        await engine.start();
        this.engines.set(ns, engine);
      }
    }

    for (const ns of [...this.engines.keys()]) {
      if (!linkedSet.has(ns)) {
        this.engines.get(ns)?.disconnect();
        this.engines.delete(ns);
        delete this.pools[ns];
      }
    }
    this.emit();
  }

  getPool(namespaceId: string): PoolState | undefined {
    return this.pools[namespaceId];
  }

  getPools(): LinkedPools {
    return { ...this.pools };
  }

  /** Load a namespace once (e.g. parent ID before join proposal). */
  async ensureNamespace(
    namespaceId: string,
    keyPair: KeyPair,
    relayUrls: string[],
  ): Promise<PoolState | undefined> {
    if (this.pools[namespaceId]) return this.pools[namespaceId];
    if (this.engines.has(namespaceId)) {
      await this.waitForNamespaceState(namespaceId);
      return this.pools[namespaceId];
    }
    const engine = new SyncEngine(relayUrls, namespaceId, keyPair);
    engine.onEvents((events) => {
      this.pools[namespaceId] = reduceEvents(namespaceId, events);
      this.emit();
    });
    await engine.start();
    this.engines.set(namespaceId, engine);
    await this.waitForNamespaceState(namespaceId);
    return this.pools[namespaceId];
  }

  /** Await first reducer state (local cache or sync_batch) before join proposals. */
  private async waitForNamespaceState(
    namespaceId: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    if (this.pools[namespaceId]) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.pools[namespaceId]) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  stop(): void {
    for (const engine of this.engines.values()) {
      engine.disconnect();
    }
    this.engines.clear();
    this.pools = {};
    this.emit();
  }
}
