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

  it("rejects cross-namespace events on ingest", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "sync-ns-a";

    const engine = new SyncEngine([wsUrl], ns, kp);
    await engine.start();

    const wrongNs = await signEvent(
      {
        namespaceId: "other-ns",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Wrong",
          initialPoints: "1",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );

    relay.bufferEvent(wrongNs);
    let events: unknown[] = [];
    engine.onEvents((e) => {
      events = e;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(events.length).toBe(0);
    engine.disconnect();
  });
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
