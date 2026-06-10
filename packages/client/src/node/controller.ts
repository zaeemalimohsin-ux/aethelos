import type {
  KeyPair,
  PoolState,
  ReducerSnapshot,
  RejectedReduction,
  SignedEvent,
} from "@aethelos/core";
import {
  DEFAULT_PARAMETERS,
  isBridge,
  relayGovernanceSnapshot,
  reduceWithSnapshot,
  sharePercent,
  TIMESTAMP_FORWARD_SKEW_MS,
  totalPoolPoints,
  votingWeight,
  requiredVouchLien,
  formatPointsAmount,
  type GovernanceParameter,
  type ProposalKind,
} from "@aethelos/core";
import { SyncEngine, type SyncStatus } from "../sync/engine.js";
import {
  mergeActiveRelays,
  relaySetsEqual,
  relayUrlsForInvite,
} from "../app/active-relays.js";
import { BridgeMirrorCoordinator } from "./bridge-mirror.js";
import { FederationReader, type LinkedPools } from "./federation-reader.js";

export interface NodeConfig {
  relayUrls: string[];
  namespaceId: string;
  keyPair: KeyPair;
  cellName?: string;
  ignoredCommunityRelays?: string[];
}

export type StateListener = (state: PoolState | null) => void;
export type LinkedPoolsListener = (pools: LinkedPools) => void;

export class NodeController {
  readonly sync: SyncEngine;
  readonly federation = new FederationReader();
  private namespaceId: string;
  private keyPair: KeyPair;
  state: PoolState | null = null;
  private listeners = new Set<StateListener>();
  private worker: Worker | null = null;
  private snapshot: ReducerSnapshot | undefined;
  private seq = 0;
  private lastApplied = -1;
  private bridgeMirror = new BridgeMirrorCoordinator();
  private mirrorPending = false;
  private lastRelayedGovernance = "";
  private bridgedProposals = new Set<string>();
  private sessionRelays: string[];
  private ignoredCommunityRelays: Set<string>;

  constructor(config: NodeConfig) {
    this.namespaceId = config.namespaceId;
    this.keyPair = config.keyPair;
    this.sessionRelays = [...config.relayUrls];
    this.ignoredCommunityRelays = new Set(config.ignoredCommunityRelays ?? []);
    this.sync = new SyncEngine(config.relayUrls, config.namespaceId, config.keyPair);
    this.sync.onEvents(() => this.recompute());
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./reducer.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.postMessage({ type: "init", namespaceId: this.namespaceId });
      this.worker.onmessage = (
        e: MessageEvent<{
          type: string;
          seq: number;
          state: PoolState;
          rejected?: RejectedReduction[];
        }>,
      ) => {
        if (e.data.type === "state" && e.data.seq > this.lastApplied) {
          this.lastApplied = e.data.seq;
          this.state = e.data.state;
          this.logRejectedReductions(e.data.rejected ?? []);
          this.syncRelaysFromPool();
          this.emit();
          void this.maybeMirrorBridges(this.sync.getEvents());
        }
      };
      this.worker.onerror = () => {
        // Fall back to main-thread reduction if the worker fails.
        this.worker?.terminate();
        this.worker = null;
        this.recompute();
      };
    } catch {
      this.worker = null;
    }
  }

  async start(): Promise<void> {
    await this.sync.start();
    this.recompute();
  }

  stop(): void {
    this.bridgeMirror.stop();
    this.federation.stop();
    this.sync.disconnect();
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSyncStatus(listener: (s: SyncStatus) => void): () => void {
    return this.sync.onStatus(listener);
  }

  onLinkedPools(listener: LinkedPoolsListener): () => void {
    return this.federation.onUpdate(listener);
  }

  getLinkedPools(): LinkedPools {
    return this.federation.getPools();
  }

  async ensureLinkedNamespace(namespaceId: string): Promise<PoolState | undefined> {
    return this.federation.ensureNamespace(
      namespaceId,
      this.keyPair,
      this.sync.getRelays(),
    );
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  recompute(): void {
    const events: SignedEvent[] = this.sync.getEvents();
    if (this.worker) {
      this.worker.postMessage({ type: "reduce", seq: ++this.seq, events });
      return;
    }
    const rejected: RejectedReduction[] = [];
    this.snapshot = reduceWithSnapshot(this.namespaceId, events, this.snapshot, rejected);
    this.state = this.snapshot.state;
    this.logRejectedReductions(rejected);
    this.syncRelaysFromPool();
    this.emit();
    void this.maybeMirrorBridges(events);
  }

  private syncRelaysFromPool(): void {
    if (!this.state) return;
    const merged = mergeActiveRelays(
      this.sessionRelays,
      this.state.communityRelays,
      this.namespaceId,
      { ignoredCommunityRelays: [...this.ignoredCommunityRelays] },
    );
    const current = this.sync.getRelays();
    if (!relaySetsEqual(current, merged)) {
      this.sync.setRelays(merged);
    }
  }

  private async maybeMirrorBridges(events: SignedEvent[]): Promise<void> {
    if (!this.state || this.mirrorPending) return;
    const pool = this.state;
    const myKey = this.keyPair.publicKeyHex;

    void this.federation.sync(pool, this.keyPair, this.sync.getRelays());

    this.mirrorPending = true;
    try {
      if (isBridge(pool, myKey)) {
        await this.bridgeMirror.syncLinkedNamespaces(
          pool,
          this.keyPair,
          this.sync.getRelays(),
          myKey,
        );
        if (pool.head === myKey && pool.parentSuperstructures.length > 0) {
          await this.maybeRelayGovernance(pool);
        }
        await this.bridgeMirror.mirrorOutboundEvents(pool, this.sync.getEvents(), myKey);
        await this.maybeAutoFlushChildEscrow(pool, myKey);
        await this.maybeExecuteApprovedBridges(pool, myKey);
      } else if (pool.head === myKey && pool.parentSuperstructures.length > 0) {
        await this.maybeRelayGovernance(pool);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[aethelos] bridge mirror failed", err);
      }
    } finally {
      this.mirrorPending = false;
      if (
        this.state &&
        isBridge(this.state, myKey) &&
        this.sync.getEvents().length > events.length
      ) {
        void this.maybeMirrorBridges(this.sync.getEvents());
      }
    }
  }

  private async maybeRelayGovernance(pool: PoolState): Promise<void> {
    const snapshot = JSON.stringify(relayGovernanceSnapshot(pool));
    if (snapshot === this.lastRelayedGovernance) return;
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: {
        type: "relay_cell_governance",
        cellId: pool.namespaceId,
        parameters: relayGovernanceSnapshot(pool),
        population: pool.members.length,
      },
    });
    this.lastRelayedGovernance = snapshot;
  }

  private flushedEscrow: Record<string, string> = {};

  private async maybeAutoFlushChildEscrow(pool: PoolState, myKey: string): Promise<void> {
    for (const childId of pool.childCells ?? []) {
      const escrow = pool.childCellEscrow?.[childId] ?? 0n;
      const marker = escrow.toString();
      if (escrow <= 0n || this.flushedEscrow[childId] === marker) continue;
      const childPool = this.federation.getPool(childId);
      const recipient = childPool?.head ?? myKey;
      const proposalId = `auto-flush:${childId}:${marker}`;
      const existing = pool.proposals[proposalId];
      if (!existing) {
        await this.createProposal(proposalId, "bridge_transfer", {
          target: childId,
          to: recipient,
          amount: marker,
        });
        await this.voteProposal(proposalId, true);
        return;
      }
      if (!existing.executed || existing.bridgeCompleted) continue;
      this.flushedEscrow[childId] = marker;
      await this.bridgeTransaction(childId, recipient, marker, proposalId);
    }
  }

  private async maybeExecuteApprovedBridges(
    pool: PoolState,
    myKey: string,
  ): Promise<void> {
    if (!isBridge(pool, myKey)) return;
    for (const [proposalId, proposal] of Object.entries(pool.proposals)) {
      if (proposal.kind !== "bridge_transfer") continue;
      if (!proposal.executed || proposal.bridgeCompleted) continue;
      if (this.bridgedProposals.has(proposalId)) continue;
      const remoteId = proposal.data["target"];
      const to = proposal.data["to"];
      const amount = proposal.data["amount"];
      if (!remoteId || !to || !amount) continue;
      this.bridgedProposals.add(proposalId);
      await this.bridgeTransaction(remoteId, to, amount, proposalId);
    }
  }

  private logRejectedReductions(rejected: RejectedReduction[]): void {
    if (rejected.length === 0 || !import.meta.env.DEV) return;
    console.warn(
      `[aethelos] ${rejected.length} event(s) rejected during reduction`,
      rejected,
    );
  }

  getNamespaceId(): string {
    return this.namespaceId;
  }

  getMyKey(): string {
    return this.keyPair.publicKeyHex;
  }

  getRelayUrls(): string[] {
    return this.sync.getRelays();
  }

  getInviteRelayUrls(): string[] {
    return relayUrlsForInvite(this.sync.getRelays(), this.namespaceId);
  }

  getSessionRelays(): string[] {
    return [...this.sessionRelays];
  }

  getIgnoredCommunityRelays(): string[] {
    return [...this.ignoredCommunityRelays];
  }

  ignoreCommunityRelay(url: string): void {
    this.ignoredCommunityRelays.add(url.trim());
    this.syncRelaysFromPool();
  }

  getSyncStatus(): SyncStatus {
    return this.sync.getStatus();
  }

  getSharePercent(member?: string): number {
    if (!this.state) return 0;
    const local = sharePercent(this.state, member ?? this.keyPair.publicKeyHex);
    let total = totalPoolPoints(this.state);
    for (const linked of Object.values(this.federation.getPools())) {
      total += totalPoolPoints(linked);
    }
    if (total === 0n) return local;
    const balance = this.state.balances[member ?? this.keyPair.publicKeyHex] ?? 0n;
    return Number((balance * 10000n) / total) / 100;
  }

  getFederatedPoolTotal(): bigint {
    if (!this.state) return 0n;
    let total = totalPoolPoints(this.state);
    for (const linked of Object.values(this.federation.getPools())) {
      total += totalPoolPoints(linked);
    }
    return total;
  }

  async genesis(cellName: string, initialPoints = "10000"): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 1,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: {
        type: "genesis",
        cellName,
        initialPoints,
        parameters: { ...DEFAULT_PARAMETERS },
      },
    });
    this.recompute();
  }

  async invite(inviteePubkey: string, parameters = DEFAULT_PARAMETERS): Promise<void> {
    if (!this.state) throw new Error("pool_not_initialized");
    const bond = requiredVouchLien(this.state, this.keyPair.publicKeyHex);
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: {
        type: "invite",
        invitee: inviteePubkey,
        vouchBondAmount: formatPointsAmount(bond),
        parameters: { ...parameters },
      },
    });
    this.recompute();
  }

  async acceptInvite(inviterPubkey: string): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "accept_invite", inviter: inviterPubkey },
    });
    this.recompute();
  }

  async cancelInvite(inviteePubkey: string): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "cancel_invite", invitee: inviteePubkey },
    });
    this.recompute();
  }

  async contributeRelay(url: string): Promise<void> {
    const trimmed = url.trim();
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "relay_contribute", url: trimmed },
    });
    if (!this.sessionRelays.includes(trimmed)) {
      this.sessionRelays = [...this.sessionRelays, trimmed];
    }
    this.recompute();
  }

  async revokeRelay(url: string): Promise<void> {
    const trimmed = url.trim();
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "relay_revoke", url: trimmed },
    });
    this.ignoredCommunityRelays.delete(trimmed);
    this.recompute();
  }

  async buildSignedInvitePayload(
    cellName: string,
    relayUrls: string[],
  ): Promise<import("../app/invite.js").InvitePayload> {
    const { signInvitePayload } = await import("../app/invite.js");
    return signInvitePayload(
      {
        v: 1,
        ns: this.namespaceId,
        inviter: this.keyPair.publicKeyHex,
        cell: cellName,
        relays: relayUrls,
      },
      this.keyPair,
    );
  }

  async transfer(
    to: string,
    amount: string,
    memo?: string,
    timestamp?: number,
  ): Promise<void> {
    const now = Date.now();
    let ts = timestamp ?? now;
    if (timestamp === undefined && ts > now + TIMESTAMP_FORWARD_SKEW_MS) {
      ts = now + TIMESTAMP_FORWARD_SKEW_MS;
    }
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: ts,
      payload: {
        type: "transaction",
        to,
        amount,
        ...(memo ? { memo } : {}),
      },
    });
    this.recompute();
  }

  async updateSlider(
    parameter: GovernanceParameter | "redistribution",
    value: number,
    target?: string,
  ): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: {
        type: "slider_update",
        parameter,
        value,
        ...(target ? { target } : {}),
      },
    });
    this.recompute();
  }

  async updateVouch(target: string, weight: number): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "vouch_update", target, weight },
    });
    this.recompute();
  }

  // Epochs now close deterministically from log progress in the Reducer; there is no
  // manual epoch trigger (that would let someone force or accelerate decay).

  async createProposal(
    proposalId: string,
    kind: import("@aethelos/core").ProposalKind,
    data: Record<string, string>,
  ): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "proposal_create", proposalId, kind, data },
    });
    this.recompute();
  }

  async voteProposal(proposalId: string, approve: boolean): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "proposal_vote", proposalId, approve },
    });
    this.recompute();
  }

  async closeProposal(proposalId: string): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: { type: "proposal_close", proposalId },
    });
    this.recompute();
  }

  setRelays(urls: string[]): void {
    this.sessionRelays = [...urls];
    this.syncRelaysFromPool();
  }

  addRelay(url: string): void {
    const trimmed = url.trim();
    if (!this.sessionRelays.includes(trimmed)) {
      this.sessionRelays = [...this.sessionRelays, trimmed];
    }
    this.syncRelaysFromPool();
  }

  removeRelay(url: string): void {
    this.sessionRelays = this.sessionRelays.filter((r) => r !== url);
    this.syncRelaysFromPool();
  }

  async bridgeTransaction(
    remoteNamespaceId: string,
    to: string,
    amount: string,
    localProposalId: string,
  ): Promise<void> {
    await this.sync.publish({
      namespaceId: this.namespaceId,
      prevHash: null,
      lamport: 0,
      author: this.keyPair.publicKeyHex,
      timestamp: Date.now(),
      payload: {
        type: "bridge_transaction",
        superstructureId: remoteNamespaceId,
        localProposalId,
        to,
        amount,
      },
    });
    this.recompute();
  }

  async importLog(json: string): Promise<{ imported: number; skipped: number }> {
    const { importEventLog } = await import("../storage/event-log.js");
    const result = await importEventLog(json, this.namespaceId);
    await this.sync.reloadFromStorage();
    this.snapshot = undefined;
    this.recompute();
    return result;
  }

  exportLog(): Promise<string> {
    return import("../storage/event-log.js").then((m) =>
      m.exportEventLog(this.namespaceId),
    );
  }
}

export function generateNamespaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
