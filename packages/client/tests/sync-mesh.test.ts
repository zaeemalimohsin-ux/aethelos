import { describe, it, expect, afterEach } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  DEFAULT_PARAMETERS,
} from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../../relay/src/server.js";
import { SyncEngine } from "../src/sync/engine.js";

describe("headless sync mesh convergence", () => {
  let relay: RelayServer | null = null;

  afterEach(async () => {
    await relay?.close();
    relay = null;
  });

  it("three engines converge on identical balances after shared genesis", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "mesh-headless";
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
    const canonical = reduceEvents(ns, [genesis]);
    const engines: SyncEngine[] = [];
    for (let i = 0; i < 3; i++) {
      const engine = new SyncEngine([wsUrl], ns, kp);
      engines.push(engine);
      await engine.start();
      if (i === 0) {
        await engine.publish({
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
        });
      }
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const allReady = engines.every((e) => e.getEvents().length >= 1);
      if (allReady) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const engine of engines) {
      const state = reduceEvents(ns, engine.getEvents());
      expect(state.balances[kp.publicKeyHex]).toEqual(
        canonical.balances[kp.publicKeyHex],
      );
      engine.disconnect();
    }
  }, 20_000);
});
