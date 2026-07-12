import { describe, it, expect } from "vitest";
import { generateKeyPair, signEvent, DEFAULT_PARAMETERS } from "@aethelos/core";
import { importEventLog, loadEvents } from "../src/storage/event-log.js";

describe("dual-fork import policy", () => {
  it("imports both causal sibling tips from a forked tip", async () => {
    const kp = await generateKeyPair();
    const ns = "fork-reducer-ns";
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Fork",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const forkA = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: { type: "transaction", to: kp.publicKeyHex, amount: "1" },
      },
      kp.privateKey,
    );
    const forkB = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "transaction", to: kp.publicKeyHex, amount: "2" },
      },
      kp.privateKey,
    );
    const result = await importEventLog(JSON.stringify([g, forkA, forkB]), ns);
    expect(result.imported).toBe(3);
    const loaded = await loadEvents(ns);
    expect(loaded).toHaveLength(3);
    expect(loaded.some((e) => e.id === forkA.id)).toBe(true);
    expect(loaded.some((e) => e.id === forkB.id)).toBe(true);
  });
});
