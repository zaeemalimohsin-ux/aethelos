import { describe, it, expect, afterEach } from "vitest";
import {
  generateKeyPair,
  reduceEvents,
  reduceEventsWithAudit,
  DEFAULT_PARAMETERS,
  relayGovernanceSnapshot,
} from "@aethelos/core";
import { startRelayServer, type RelayServer } from "../../relay/src/server.js";
import { SyncEngine } from "../src/sync/engine.js";
import { BridgeMirrorCoordinator } from "../src/node/bridge-mirror.js";

describe("governance relay across namespaces", () => {
  let relay: RelayServer | null = null;

  afterEach(async () => {
    await relay?.close();
    relay = null;
  });

  it(
    "mirrors child relay_cell_governance to parent via relay",
    { timeout: 15_000 },
    async () => {
    relay = await startRelayServer({ port: 0 });
    const wsUrl = `ws://127.0.0.1:${relay.port}`;

    const parentHead = await generateKeyPair();
    const childHead = await generateKeyPair();
    const parentNs = "parent-gov-relay";
    const childNs = "child-gov-relay";

    const parentEngine = new SyncEngine([wsUrl], parentNs, parentHead);
    let parentEvents = parentEngine.getEvents();
    parentEngine.onEvents((events) => {
      parentEvents = events;
    });
    await parentEngine.start();

    await parentEngine.publish({
      namespaceId: parentNs,
      prevHash: null,
      lamport: 1,
      author: parentHead.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Parent",
        initialPoints: "10000",
        parameters: DEFAULT_PARAMETERS,
      },
    });
    await parentEngine.publish({
      namespaceId: parentNs,
      prevHash: null,
      lamport: 0,
      author: parentHead.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "proposal_create",
        proposalId: "link1",
        kind: "link_subcell",
        data: {
          target: childNs,
          population: "1",
          bridge: childHead.publicKeyHex,
        },
      },
    });
    await parentEngine.publish({
      namespaceId: parentNs,
      prevHash: null,
      lamport: 0,
      author: parentHead.publicKeyHex,
      timestamp: 3,
      payload: { type: "proposal_vote", proposalId: "link1", approve: true },
    });

    const afterLink = reduceEvents(parentNs, parentEngine.getEvents());
    expect(afterLink.bridges).toContain(childHead.publicKeyHex);
    expect(afterLink.childCells).toContain(childNs);

    const childEngine = new SyncEngine([wsUrl], childNs, childHead);
    let childEvents = childEngine.getEvents();
    childEngine.onEvents((events) => {
      childEvents = events;
    });
    await childEngine.start();

    await childEngine.publish({
      namespaceId: childNs,
      prevHash: null,
      lamport: 1,
      author: childHead.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Child",
        initialPoints: "10000",
        parameters: DEFAULT_PARAMETERS,
      },
    });
    await childEngine.publish({
      namespaceId: childNs,
      prevHash: null,
      lamport: 0,
      author: childHead.publicKeyHex,
      timestamp: 2,
      payload: {
        type: "proposal_create",
        proposalId: "join1",
        kind: "join_superstructure",
        data: { target: parentNs },
      },
    });
    await childEngine.publish({
      namespaceId: childNs,
      prevHash: null,
      lamport: 0,
      author: childHead.publicKeyHex,
      timestamp: 3,
      payload: { type: "proposal_vote", proposalId: "join1", approve: true },
    });
    await childEngine.publish({
      namespaceId: childNs,
      prevHash: null,
      lamport: 0,
      author: childHead.publicKeyHex,
      timestamp: 4,
      payload: { type: "slider_update", parameter: "decay_rate", value: 18 },
    });

    const childPool = reduceEvents(childNs, childEvents);
    expect(childPool.parameters.decay_rate).toBe(18);

    await childEngine.publish({
      namespaceId: childNs,
      prevHash: null,
      lamport: 0,
      author: childHead.publicKeyHex,
      timestamp: 5,
      payload: {
        type: "relay_cell_governance",
        cellId: childNs,
        parameters: relayGovernanceSnapshot(childPool),
        population: childPool.members.length,
      },
    });

    const mirror = new BridgeMirrorCoordinator();
    await mirror.syncLinkedNamespaces(childPool, childHead, [wsUrl], childHead.publicKeyHex);
    await mirror.mirrorOutboundEvents(
      childPool,
      childEngine.getEvents(),
      childHead.publicKeyHex,
    );

    await new Promise((r) => setTimeout(r, 2000));

    expect(parentEvents.length).toBeGreaterThan(3);
    const { state: reducedParent, rejected } = reduceEventsWithAudit(parentNs, parentEvents);
    expect(rejected.filter((r) => r.eventType === "relay_cell_governance")).toHaveLength(0);
    expect(reducedParent.bridges).toContain(childHead.publicKeyHex);
    expect(reducedParent.parameters.decay_rate).toBeGreaterThan(DEFAULT_PARAMETERS.decay_rate);

    parentEngine.disconnect();
    childEngine.disconnect();
    mirror.stop();
  },
  );
});
