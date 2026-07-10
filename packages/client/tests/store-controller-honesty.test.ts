import { describe, it, expect, afterEach } from "vitest";
import { generateKeyPair, DEFAULT_PARAMETERS } from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../../relay/src/server.js";
import { NodeController } from "../src/node/controller.js";

describe("NodeController waitForConfirmedState", () => {
  let relay: RelayServer | null = null;

  afterEach(async () => {
    await relay?.close();
    relay = null;
  });

  it("waitForConfirmedState resolves false immediately after stop()", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "wait-stop";
    const controller = new NodeController({
      relayUrls: [wsUrl],
      namespaceId: ns,
      keyPair: kp,
    });
    await controller.start();
    const pending = controller.waitForConfirmedState(() => false, 15_000);
    controller.stop();
    const ok = await pending;
    expect(ok).toBe(false);
  }, 20_000);

  it("waitForConfirmedState true after genesis when outbox drains", async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;
    const kp = await generateKeyPair();
    const ns = "wait-genesis";
    const controller = new NodeController({
      relayUrls: [wsUrl],
      namespaceId: ns,
      keyPair: kp,
    });
    await controller.start();
    await controller.genesis("Honesty Cell");
    const ok = await controller.waitForConfirmedState((p) => p.initialized, 15_000);
    expect(ok).toBe(true);
    expect(controller.sync.getStatus().pendingOutbox).toBe(0);
    controller.stop();
  }, 20_000);
});
