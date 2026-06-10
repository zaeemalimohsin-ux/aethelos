import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import {
  generateKeyPair,
  signEvent,
  WIRE_VERSION,
  type RelayMessage,
  type SignedEvent,
} from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../src/server.js";

async function signedGenesis(ns: string): Promise<{ event: SignedEvent; kp: Awaited<ReturnType<typeof generateKeyPair>> }> {
  const kp = await generateKeyPair();
  const event = await signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Relay Test",
        initialPoints: "100",
        parameters: {
          decay_rate: 5,
          approval_threshold: 51,
          vouch_threshold: 51,
          epoch_interval: 60,
          vouch_bond_rate: 1,
        },
      },
    },
    kp.privateKey,
  );
  return { event, kp };
}

function wsUrl(port: number): string {
  return `ws://127.0.0.1:${port}`;
}

async function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.text() };
}

describe("relay server", () => {
  let server: RelayServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("responds on health and metrics endpoints", async () => {
    server = await startRelayServer({ port: 0 });
    const health = await httpGet(server.port, "/healthz");
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body).status).toBe("ok");

    const metrics = await httpGet(server.port, "/metrics");
    expect(metrics.status).toBe(200);
    const m = JSON.parse(metrics.body);
    expect(m.connections).toBe(0);
    expect(typeof m.uptimeMs).toBe("number");
  });

  it("buffers announced events and serves them on request_sync", async () => {
    server = await startRelayServer({ port: 0 });
    const { event } = await signedGenesis("ns-relay-1");
    const envelope = {
      version: WIRE_VERSION,
      namespaceId: event.namespaceId,
      event,
    };

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(server!.port));
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "announce", envelope } satisfies RelayMessage));
        ws.send(
          JSON.stringify({
            type: "request_sync",
            namespaceId: event.namespaceId,
          } satisfies RelayMessage),
        );
      });
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as RelayMessage;
        if (msg.type === "sync_batch") {
          expect(msg.events.some((e) => e.id === event.id)).toBe(true);
          ws.close();
          resolve();
        }
      });
      ws.on("error", reject);
    });
  });

  it("does not double-buffer the same event id", async () => {
    server = await startRelayServer({ port: 0, maxBuffer: 100 });
    const { event } = await signedGenesis("ns-dedup");
    server.bufferEvent(event);
    server.bufferEvent(event);
    expect(server.bufferedEvents("ns-dedup")).toHaveLength(1);
  });

  it("enforces max buffer size per namespace", async () => {
    server = await startRelayServer({ port: 0, maxBuffer: 3 });
    const kp = await generateKeyPair();
    for (let i = 0; i < 5; i++) {
      const event = await signEvent(
        {
          namespaceId: "ns-cap",
          prevHash: null,
          lamport: i + 1,
          author: kp.publicKeyHex,
          timestamp: i + 1,
          payload: { type: "transaction", to: kp.publicKeyHex, amount: "1" },
        },
        kp.privateKey,
      );
      server.bufferEvent(event);
    }
    expect(server.bufferedEvents("ns-cap").length).toBeLessThanOrEqual(3);
  });

  it("evicts events older than buffer TTL", async () => {
    let clock = 1_000_000;
    server = await startRelayServer({
      port: 0,
      bufferTtlMs: 100,
      now: () => clock,
    });
    const { event } = await signedGenesis("ns-ttl");
    server.bufferEvent(event);
    expect(server.bufferedEvents("ns-ttl")).toHaveLength(1);
    clock += 200;
    expect(server.bufferedEvents("ns-ttl")).toHaveLength(0);
  });

  it("rejects invalid relay messages", async () => {
    server = await startRelayServer({ port: 0, rateLimit: 1000 });
    const before = server.getMetrics().rejected;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(server!.port));
      ws.on("open", () => {
        ws.send("{not valid json");
        ws.send(JSON.stringify({ type: "unknown_type" }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 50);
      });
      ws.on("error", reject);
    });

    expect(server.getMetrics().rejected).toBeGreaterThan(before);
  });

  it("rate limits excessive messages per connection", async () => {
    server = await startRelayServer({
      port: 0,
      rateLimit: 3,
      rateWindowMs: 60_000,
    });
    const before = server.getMetrics().messagesIn;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(server!.port));
      ws.on("open", () => {
        for (let i = 0; i < 10; i++) {
          ws.send(JSON.stringify({ type: "ping" } satisfies RelayMessage));
        }
        setTimeout(() => {
          ws.close();
          resolve();
        }, 50);
      });
      ws.on("error", reject);
    });

    expect(server.getMetrics().messagesIn).toBeGreaterThanOrEqual(before + 3);
    expect(server.getMetrics().rejected).toBeGreaterThan(0);
  });
});
