import type {
  KeyPair,
  RelayMessage,
  SignedEvent,
  UnsignedEvent,
  WireEnvelope,
} from "@aethelos/core";
import {
  WIRE_VERSION,
  isValidWireEnvelope,
  isValidRelayMessage,
  mergeEventLogs,
  maxLamport,
  nextLamport,
  signEvent,
  sortEvents,
  verifyEventSync,
} from "@aethelos/core";
import { appendEvent, appendEvents, loadEvents } from "../storage/event-log.js";
import { loadOutbox, saveOutbox } from "../storage/outbox.js";

export type SyncListener = (events: SignedEvent[]) => void;

export interface RelayState {
  url: string;
  status: "online" | "connecting" | "offline";
}

export interface SyncStatus {
  /** Best status across all relays. */
  overall: "online" | "connecting" | "offline";
  relays: RelayState[];
  pendingOutbox: number;
}

type StatusListener = (s: SyncStatus) => void;

const MAX_BACKOFF = 30_000;
const BASE_BACKOFF = 1_000;

interface RelayConn {
  url: string;
  ws: WebSocket | null;
  status: "online" | "connecting" | "offline";
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Multi-relay sync engine. Connects to several relays at once for resilience,
 * reconnects with exponential backoff, and queues outbound events in a durable
 * offline outbox that flushes when any relay comes online.
 */
export class SyncEngine {
  private conns = new Map<string, RelayConn>();
  private namespaceId: string;
  private keyPair: KeyPair;
  private localEvents: SignedEvent[] = [];
  private outbox: WireEnvelope[] = [];
  private listeners = new Set<SyncListener>();
  private statusListeners = new Set<StatusListener>();
  private started = false;

  constructor(relayUrls: string[], namespaceId: string, keyPair: KeyPair) {
    this.namespaceId = namespaceId;
    this.keyPair = keyPair;
    for (const url of dedupe(relayUrls)) {
      this.conns.set(url, { url, ws: null, status: "offline", attempts: 0, timer: null });
    }
  }

  onEvents(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  private emitEvents(): void {
    const sorted = sortEvents(this.localEvents);
    for (const l of this.listeners) l(sorted);
  }

  private emitStatus(): void {
    const s = this.getStatus();
    for (const l of this.statusListeners) l(s);
  }

  getStatus(): SyncStatus {
    const relays: RelayState[] = [...this.conns.values()].map((c) => ({
      url: c.url,
      status: c.status,
    }));
    const overall: SyncStatus["overall"] = relays.some((r) => r.status === "online")
      ? "online"
      : relays.some((r) => r.status === "connecting")
        ? "connecting"
        : "offline";
    return { overall, relays, pendingOutbox: this.outbox.length };
  }

  getRelays(): string[] {
    return [...this.conns.keys()];
  }

  getEvents(): SignedEvent[] {
    return sortEvents(this.localEvents);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.localEvents = await loadEvents(this.namespaceId);
    this.outbox = await loadOutbox(this.namespaceId);
    this.emitEvents();
    for (const conn of this.conns.values()) this.connect(conn);
  }

  addRelay(url: string): void {
    if (this.conns.has(url)) return;
    const conn: RelayConn = {
      url,
      ws: null,
      status: "offline",
      attempts: 0,
      timer: null,
    };
    this.conns.set(url, conn);
    if (this.started) this.connect(conn);
    this.emitStatus();
  }

  removeRelay(url: string): void {
    const conn = this.conns.get(url);
    if (!conn) return;
    if (conn.timer) clearTimeout(conn.timer);
    conn.ws?.close();
    this.conns.delete(url);
    this.emitStatus();
  }

  /** Replace the whole relay set (used by "switch relay"). */
  setRelays(urls: string[]): void {
    const next = new Set(dedupe(urls));
    for (const url of [...this.conns.keys()]) {
      if (!next.has(url)) this.removeRelay(url);
    }
    for (const url of next) this.addRelay(url);
  }

  private connect(conn: RelayConn): void {
    if (
      conn.ws &&
      (conn.ws.readyState === WebSocket.OPEN ||
        conn.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    conn.status = "connecting";
    this.emitStatus();

    let ws: WebSocket;
    try {
      ws = new WebSocket(conn.url);
    } catch {
      this.scheduleReconnect(conn);
      return;
    }
    conn.ws = ws;

    ws.onopen = () => {
      conn.status = "online";
      conn.attempts = 0;
      this.emitStatus();
      this.requestSyncOn(conn);
      this.flushOutbox();
    };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as unknown;
        if (!isValidRelayMessage(parsed)) return;
        void this.handleMessage(parsed);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      conn.status = "offline";
      conn.ws = null;
      this.emitStatus();
      this.scheduleReconnect(conn);
    };
    // Do not call ws.close() here — undici can recurse error/close and blow the stack.
    ws.onerror = () => {};
  }

  private scheduleReconnect(conn: RelayConn): void {
    if (conn.timer) return;
    const delay = Math.min(MAX_BACKOFF, BASE_BACKOFF * 2 ** conn.attempts);
    conn.attempts += 1;
    conn.timer = setTimeout(() => {
      conn.timer = null;
      this.connect(conn);
    }, delay);
  }

  async reloadFromStorage(): Promise<void> {
    this.localEvents = await loadEvents(this.namespaceId);
    this.emitEvents();
  }

  disconnect(): void {
    for (const conn of this.conns.values()) {
      if (conn.timer) clearTimeout(conn.timer);
      conn.timer = null;
      const ws = conn.ws;
      if (
        ws &&
        ws.readyState !== WebSocket.CLOSED &&
        ws.readyState !== WebSocket.CLOSING
      ) {
        ws.close();
      }
      conn.ws = null;
      conn.status = "offline";
    }
    this.started = false;
    this.emitStatus();
  }

  private async handleMessage(msg: RelayMessage): Promise<void> {
    if (msg.type === "sync_batch" && msg.namespaceId === this.namespaceId) {
      await this.ingestRemote(msg.events);
    } else if (
      msg.type === "announce" &&
      msg.envelope.namespaceId === this.namespaceId &&
      isValidWireEnvelope(msg.envelope)
    ) {
      await this.ingestRemote([msg.envelope.event]);
    }
  }

  private async ingestRemote(remote: SignedEvent[]): Promise<void> {
    // Defense in depth: verify signatures and namespace before persisting anything.
    const valid = remote.filter(
      (e) => e.namespaceId === this.namespaceId && verifyEventSync(e),
    );
    const known = new Set(this.localEvents.map((e) => e.id));
    const fresh = valid.filter((e) => !known.has(e.id));
    if (fresh.length === 0) return;
    await appendEvents(fresh);
    this.localEvents = mergeEventLogs(this.localEvents, fresh);
    this.emitEvents();
  }

  private requestSyncOn(conn: RelayConn): void {
    if (conn.ws?.readyState !== WebSocket.OPEN) return;
    const last = sortEvents(this.localEvents).at(-1);
    const msg: RelayMessage = {
      type: "request_sync",
      namespaceId: this.namespaceId,
      ...(last ? { sinceHash: last.id } : {}),
    };
    conn.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: RelayMessage): boolean {
    let sentToAny = false;
    for (const conn of this.conns.values()) {
      if (conn.ws?.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(msg));
        sentToAny = true;
      }
    }
    return sentToAny;
  }

  private async flushOutbox(): Promise<void> {
    if (this.outbox.length === 0) return;
    const remaining: WireEnvelope[] = [];
    for (const envelope of this.outbox) {
      const sent = this.broadcast({ type: "announce", envelope });
      if (!sent) remaining.push(envelope);
    }
    this.outbox = remaining;
    await saveOutbox(this.namespaceId, this.outbox);
    this.emitStatus();
  }

  async publish(unsigned: UnsignedEvent): Promise<SignedEvent> {
    const lamport = nextLamport(
      maxLamport(this.localEvents),
      0,
      maxLamport(this.localEvents.filter((e) => e.author === unsigned.author)),
    );
    const last = sortEvents(this.localEvents).at(-1);
    const event = await signEvent(
      {
        ...unsigned,
        lamport,
        prevHash: last?.id ?? null,
        author: this.keyPair.publicKeyHex,
      },
      this.keyPair.privateKey,
    );

    await appendEvent(event);
    this.localEvents = mergeEventLogs(this.localEvents, [event]);
    this.emitEvents();

    const envelope: WireEnvelope = {
      version: WIRE_VERSION,
      namespaceId: this.namespaceId,
      event,
    };
    const sent = this.broadcast({ type: "announce", envelope });
    if (!sent) {
      // Offline: durably queue so it propagates when a relay returns.
      this.outbox.push(envelope);
      await saveOutbox(this.namespaceId, this.outbox);
      this.emitStatus();
    }

    return event;
  }
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => u && u.trim().length > 0))];
}
