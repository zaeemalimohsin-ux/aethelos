import { describe, it, expect, afterEach } from "vitest";
import { generateKeyPair, DEFAULT_PARAMETERS } from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../../relay/src/server.js";
import { SyncEngine } from "../src/sync/engine.js";

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor timeout");
}

describe("sync partition failover", () => {
  let relayA: RelayServer | null = null;
  let relayB: RelayServer | null = null;

  afterEach(async () => {
    await relayA?.close();
    await relayB?.close();
    relayA = null;
    relayB = null;
  });

  it("stays online on surviving relay when first relay dies", async () => {
    relayA = await startRelayServer({ port: 0 });
    relayB = await startRelayServer({ port: 0 });
    const urlA = `ws://127.0.0.1:${relayA.port}`;
    const urlB = `ws://127.0.0.1:${relayB.port}`;
    const kp = await generateKeyPair();
    const ns = "partition-failover";

    const engine = new SyncEngine([urlA, urlB], ns, kp);
    await engine.start();
    await waitFor(() => engine.getStatus().overall === "online");

    await engine.publish({
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Partition",
        initialPoints: "1000",
        parameters: DEFAULT_PARAMETERS,
      },
    });

    await relayA.close();
    relayA = null;
    engine.removeRelay(urlA);

    await waitFor(() => engine.getStatus().overall === "online");
    expect(engine.getRelays()).toEqual([urlB]);

    await engine.publish({
      namespaceId: ns,
      prevHash: null,
      lamport: 2,
      author: kp.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "invite",
        target: "b".repeat(64),
        memo: "partition invite",
      },
    });

    expect(engine.getEvents().length).toBeGreaterThanOrEqual(2);
    engine.disconnect();
  }, 45_000);
});
