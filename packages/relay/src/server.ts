import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { isValidRelayMessage, type RelayMessage, type SignedEvent } from "@aethelos/core";

export interface RelayOptions {
  port?: number;
  maxBuffer?: number;
  bufferTtlMs?: number;
  maxMsgBytes?: number;
  rateLimit?: number;
  rateWindowMs?: number;
  maxConnections?: number;
  /** Injectable clock for tests (TTL eviction). */
  now?: () => number;
}

export interface RelayMetrics {
  startedAt: number;
  connections: number;
  totalConnections: number;
  messagesIn: number;
  messagesOut: number;
  rejected: number;
}

export interface RelayServer {
  httpServer: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  get port(): number;
  set port(p: number);
  getMetrics: () => RelayMetrics & { uptimeMs: number; namespaces: number };
  bufferedEvents: (namespaceId: string) => SignedEvent[];
  bufferEvent: (event: SignedEvent) => void;
  close: () => Promise<void>;
}

interface BufferedEvent {
  event: SignedEvent;
  receivedAt: number;
}

export function createRelayServer(opts: RelayOptions = {}): RelayServer {
  const MAX_BUFFER = opts.maxBuffer ?? Number(process.env["MAX_BUFFER"] ?? 10000);
  const BUFFER_TTL_MS =
    opts.bufferTtlMs ?? Number(process.env["BUFFER_TTL_MS"] ?? 24 * 60 * 60 * 1000);
  const MAX_MSG_BYTES =
    opts.maxMsgBytes ?? Number(process.env["MAX_MSG_BYTES"] ?? 256 * 1024);
  const RATE_LIMIT = opts.rateLimit ?? Number(process.env["RATE_LIMIT"] ?? 100);
  const RATE_WINDOW_MS =
    opts.rateWindowMs ?? Number(process.env["RATE_WINDOW_MS"] ?? 10_000);
  const MAX_CONNECTIONS =
    opts.maxConnections ?? Number(process.env["MAX_CONNECTIONS"] ?? 5_000);
  const now = opts.now ?? (() => Date.now());

  const deliveryBuffer = new Map<string, BufferedEvent[]>();

  const metrics: RelayMetrics = {
    startedAt: now(),
    connections: 0,
    totalConnections: 0,
    messagesIn: 0,
    messagesOut: 0,
    rejected: 0,
  };

  function evictExpired(list: BufferedEvent[]): BufferedEvent[] {
    const cutoff = now() - BUFFER_TTL_MS;
    return list.filter((b) => b.receivedAt >= cutoff);
  }

  function bufferEvent(event: SignedEvent): void {
    const ns = event.namespaceId;
    let list = evictExpired(deliveryBuffer.get(ns) ?? []);
    if (!list.some((b) => b.event.id === event.id)) {
      list.push({ event, receivedAt: now() });
      if (list.length > MAX_BUFFER) list = list.slice(list.length - MAX_BUFFER);
    }
    deliveryBuffer.set(ns, list);
  }

  function bufferedEvents(ns: string): SignedEvent[] {
    const list = evictExpired(deliveryBuffer.get(ns) ?? []);
    deliveryBuffer.set(ns, list);
    return list.map((b) => b.event);
  }

  const sweep = setInterval(
    () => {
      for (const [ns, list] of deliveryBuffer) {
        const kept = evictExpired(list);
        if (kept.length === 0) deliveryBuffer.delete(ns);
        else deliveryBuffer.set(ns, kept);
      }
    },
    Math.min(BUFFER_TTL_MS, 60 * 60 * 1000),
  );
  sweep.unref();

  function broadcast(
    clients: Set<WebSocket>,
    msg: RelayMessage,
    exclude?: WebSocket,
  ): void {
    const data = JSON.stringify(msg, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    for (const client of clients) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data);
        metrics.messagesOut += 1;
      }
    }
  }

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    if (url === "/healthz" || url === "/livez") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (url === "/readyz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: true }));
      return;
    }
    if (url === "/metrics") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ...metrics,
          uptimeMs: now() - metrics.startedAt,
          namespaces: deliveryBuffer.size,
        }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(
      "AethelOS Relay — powerless delivery buffer (no ledger, no keys, no authority)\n",
    );
  });

  const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MSG_BYTES });
  const clients = new Set<WebSocket>();

  interface RateState {
    count: number;
    windowStart: number;
  }
  const rateLimits = new WeakMap<WebSocket, RateState>();

  function allow(ws: WebSocket): boolean {
    const t = now();
    const rs = rateLimits.get(ws);
    if (!rs || t - rs.windowStart > RATE_WINDOW_MS) {
      rateLimits.set(ws, { count: 1, windowStart: t });
      return true;
    }
    rs.count += 1;
    return rs.count <= RATE_LIMIT;
  }

  wss.on("connection", (ws, req) => {
    if (clients.size >= MAX_CONNECTIONS) {
      ws.close(1013, "capacity");
      return;
    }
    clients.add(ws);
    metrics.connections = clients.size;
    metrics.totalConnections += 1;

    ws.on("message", (raw) => {
      metrics.messagesIn += 1;
      if (!allow(ws)) {
        metrics.rejected += 1;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        metrics.rejected += 1;
        return;
      }
      if (!isValidRelayMessage(parsed)) {
        metrics.rejected += 1;
        return;
      }
      const msg = parsed;
      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong" } satisfies RelayMessage));
          break;
        case "announce":
          bufferEvent(msg.envelope.event);
          broadcast(clients, msg, ws);
          break;
        case "request_sync": {
          // Deterministic catch-up cursor: order the buffer by (lamport, id) and return
          // only events strictly AFTER the client's cursor position. If the cursor is
          // unknown to this relay (never buffered / evicted), fall back to the full
          // buffer so the client can still re-sync. This replaces the old "exclude the
          // single matching id" filter, which re-delivered everything on reconnect.
          const ordered = bufferedEvents(msg.namespaceId).sort((a, b) =>
            a.lamport !== b.lamport
              ? a.lamport - b.lamport
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0,
          );
          let batch = ordered;
          if (msg.sinceHash) {
            const idx = ordered.findIndex((e) => e.id === msg.sinceHash);
            batch = idx >= 0 ? ordered.slice(idx + 1) : ordered;
          }
          ws.send(
            JSON.stringify({
              type: "sync_batch",
              namespaceId: msg.namespaceId,
              events: batch,
            } satisfies RelayMessage),
          );
          metrics.messagesOut += 1;
          break;
        }
        default:
          break;
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      metrics.connections = clients.size;
    });
    ws.on("error", () => ws.close());
  });

  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  let boundPort = opts.port ?? Number(process.env["PORT"] ?? 8787);

  const api: RelayServer = {
    httpServer,
    wss,
    get port() {
      return boundPort;
    },
    set port(p: number) {
      boundPort = p;
    },
    getMetrics: () => ({
      ...metrics,
      uptimeMs: now() - metrics.startedAt,
      namespaces: deliveryBuffer.size,
    }),
    bufferedEvents,
    bufferEvent,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweep);
        clearInterval(heartbeat);
        for (const ws of clients) ws.close(1001, "server shutdown");
        wss.close();
        httpServer.close(() => resolve());
      }),
  };

  return api;
}

export async function startRelayServer(opts: RelayOptions = {}): Promise<RelayServer> {
  const server = createRelayServer(opts);
  const listenPort = opts.port ?? 0;
  await new Promise<void>((resolve) => {
    server.httpServer.listen(listenPort, resolve);
  });
  const addr = server.httpServer.address();
  if (addr && typeof addr === "object") {
    server.port = addr.port;
  }
  return server;
}
