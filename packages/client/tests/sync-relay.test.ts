import { describe, it, expect, afterEach } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../../relay/src/server.js";
import { SyncEngine } from "../src/sync/engine.js";
import { mergeActiveRelays } from "../src/app/active-relays.js";

describe("SyncEngine + relay integration", () => {
  let relay: RelayServer | null = null;
  let relay2: RelayServer | null = null;

  afterEach(async () => {
    await relay?.close();
    await relay2?.close();
    relay = null;
    relay2 = null;
  });

  it("publishes genesis and receives it back via relay sync", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "sync-int-1";

    const engine = new SyncEngine([wsUrl], ns, kp);
    let eventCount = 0;
    engine.onEvents((events) => {
      eventCount = events.length;
    });

    await engine.start();
    await engine.publish({
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Sync",
        initialPoints: "1000",
        parameters: DEFAULT_PARAMETERS,
      },
    });

    const deadline = Date.now() + 10_000;
    while (eventCount < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(eventCount).toBeGreaterThanOrEqual(1);
    engine.disconnect();
  }, 15_000);

  it("retains outbox until sync_batch confirms receipt", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "sync-outbox-honesty";

    const engine = new SyncEngine([`ws://127.0.0.1:1`], ns, kp);
    await engine.start();
    const event = await engine.publish({
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Outbox",
        initialPoints: "1000",
        parameters: DEFAULT_PARAMETERS,
      },
    });
    expect(engine.getStatus().pendingOutbox).toBe(1);

    engine.addRelay(wsUrl);
    const deadline = Date.now() + 10_000;
    while (engine.getStatus().pendingOutbox > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(engine.getStatus().pendingOutbox).toBe(0);
    expect(engine.getEvents().some((e) => e.id === event.id)).toBe(true);
    engine.disconnect();
  }, 15_000);

  it("connects to multiple relays for failover", async () => {
    relay = await startRelayServer({ port: 0 });
    relay2 = await startRelayServer({ port: 0 });
    const kp = await generateKeyPair();
    const ns = "sync-multi";
    const urls = [`ws://127.0.0.1:${relay.port}`, `ws://127.0.0.1:${relay2.port}`];

    const engine = new SyncEngine(urls, ns, kp);
    await engine.start();
    expect(engine.getRelays()).toEqual(urls);
    engine.disconnect();
  });

  it("drains outbox when second relay receives sync_batch", async () => {
    relay = await startRelayServer({ port: 0 });
    relay2 = await startRelayServer({ port: 0 });
    const deadUrl = `ws://127.0.0.1:1`;
    const liveUrl = `ws://127.0.0.1:${relay2.port}`;
    const kp = await generateKeyPair();
    const ns = "sync-failover";

    const engine = new SyncEngine([deadUrl], ns, kp);
    await engine.start();
    await engine.publish({
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Failover",
        initialPoints: "1000",
        parameters: DEFAULT_PARAMETERS,
      },
    });
    expect(engine.getStatus().pendingOutbox).toBe(1);
    engine.addRelay(liveUrl);
    const deadline = Date.now() + 10_000;
    while (engine.getStatus().pendingOutbox > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(engine.getStatus().pendingOutbox).toBe(0);
    engine.disconnect();
  }, 15_000);

  it("rejects cross-namespace events on ingest", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kpA = await generateKeyPair();
    const kpB = await generateKeyPair();
    const nsA = "sync-ns-a";
    const nsB = "sync-ns-b";

    const engineA = new SyncEngine([wsUrl], nsA, kpA);
    let eventsA: unknown[] = [];
    engineA.onEvents((e) => {
      eventsA = e;
    });
    await engineA.start();
    await engineA.publish({
      namespaceId: nsA,
      prevHash: null,
      lamport: 1,
      author: kpA.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Cell A",
        initialPoints: "1000",
        parameters: DEFAULT_PARAMETERS,
      },
    });

    const deadlineA = Date.now() + 10_000;
    while (eventsA.length < 1 && Date.now() < deadlineA) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(eventsA.length).toBe(1);

    const engineB = new SyncEngine([wsUrl], nsB, kpB);
    await engineB.start();
    await engineB.publish({
      namespaceId: nsB,
      prevHash: null,
      lamport: 1,
      author: kpB.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "genesis",
        cellName: "Cell B",
        initialPoints: "2000",
        parameters: DEFAULT_PARAMETERS,
      },
    });

    await new Promise((r) => setTimeout(r, 500));
    expect(engineA.getEvents().length).toBe(1);
    expect(engineA.getEvents()[0]!.namespaceId).toBe(nsA);
    expect(engineA.getEvents().some((e) => e.namespaceId === nsB)).toBe(false);

    engineB.disconnect();
    engineA.disconnect();
  }, 20_000);
});

describe("community mesh merge", () => {
  it("merges relay_contribute URLs from ledger into active relay set", async () => {
    const kp = await generateKeyPair();
    const ns = "mesh-merge";
    const genesis = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Mesh",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const contribute = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "relay_contribute", url: "wss://peer.example.org" },
      },
      kp.privateKey,
    );
    const pool = reduceEvents(ns, [genesis, contribute]);
    const merged = mergeActiveRelays(["ws://127.0.0.1:8787"], pool.communityRelays, ns);
    expect(merged).toContain("wss://peer.example.org");
    expect(merged).toContain("ws://127.0.0.1:8787");
  });
});
