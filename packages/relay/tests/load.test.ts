import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import {
  generateKeyPair,
  signEvent,
  WIRE_VERSION,
  type RelayMessage,
} from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../src/server.js";

function wsUrl(port: number): string {
  return `ws://127.0.0.1:${port}`;
}

describe("relay load and chaos testing", () => {
  let server: RelayServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("handles maximum connection thresholds without crashing", async () => {
    // Set a very tight connection limit so we don't exhaust Windows socket ports
    const MAX_CONN = 200;
    server = await startRelayServer({ port: 0, maxConnections: MAX_CONN });

    const sockets: WebSocket[] = [];

    // Attempt to spawn MAX_CONN + 50 sockets
    const spawnAttempts = Array.from({ length: MAX_CONN + 50 }).map(() => {
      return new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl(server!.port));
        ws.on("open", () => {
          sockets.push(ws);
          resolve();
        });
        ws.on("close", (code) => {
          resolve();
        });
        ws.on("error", () => {
          resolve();
        });
      });
    });

    await Promise.all(spawnAttempts);

    const metrics = server.getMetrics();
    expect(metrics.connections).toBe(MAX_CONN);

    for (const ws of sockets) ws.close();
  }, 10_000);

  it("handles DDOS rate limit spam gracefully", async () => {
    server = await startRelayServer({ port: 0, rateLimit: 50, rateWindowMs: 60_000 });

    const ws = new WebSocket(wsUrl(server.port));
    await new Promise<void>((resolve) => {
      ws.on("open", resolve);
    });

    // Spam 500 valid ping messages and 500 invalid ones
    for (let i = 0; i < 500; i++) {
      ws.send(JSON.stringify({ type: "ping" } satisfies RelayMessage));
      ws.send("invalid { json [ payload");
    }

    // Give it a tiny bit of time to process
    await new Promise((resolve) => setTimeout(resolve, 500));

    const metrics = server.getMetrics();
    // 50 should be processed (messagesOut), rest rejected
    expect(metrics.messagesIn).toBeGreaterThanOrEqual(1000);
    expect(metrics.rejected).toBeGreaterThan(900);

    ws.close();
  }, 10_000);

  it("handles massive broadcast flooding and buffer eviction", async () => {
    // Increase rateLimit to allow the sender to send 500 messages instantly
    server = await startRelayServer({ port: 0, maxBuffer: 100, rateLimit: 5000 });
    const kp = await generateKeyPair();

    const sockets: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(wsUrl(server.port));
      await new Promise<void>((resolve) => {
        ws.on("open", resolve);
      });
      sockets.push(ws);
    }

    // Have 1 socket announce 500 unique events to the namespace
    const sender = sockets[0];
    for (let i = 0; i < 500; i++) {
      const event = await signEvent(
        {
          namespaceId: "ns-flood",
          prevHash: null,
          lamport: i + 1,
          author: kp.publicKeyHex,
          timestamp: i + 1,
          payload: { type: "transaction", to: kp.publicKeyHex, amount: "1" },
        },
        kp.privateKey,
      );

      sender.send(
        JSON.stringify({
          type: "announce",
          envelope: { version: WIRE_VERSION, namespaceId: "ns-flood", event },
        }),
      );
    }

    // Wait for the relay to process and broadcast all of them to the other 9 sockets
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const metrics = server.getMetrics();
    expect(metrics.messagesIn).toBe(500);
    // It should have broadcasted to 9 clients 500 times = 4500
    expect(metrics.messagesOut).toBe(4500);

    // The buffer should have strictly evicted everything except the last 100
    const buffered = server.bufferedEvents("ns-flood");
    expect(buffered).toHaveLength(100);
    expect(buffered[99].lamport).toBe(500);

    for (const ws of sockets) ws.close();
  }, 30_000);
});
