import { describe, it, expect } from "vitest";
import {
  createInitialState,
  reduceOneSync,
  signEvent,
  generateKeyPair,
  DEFAULT_PARAMETERS,
  points,
} from "../src/index.js";

describe("retired direct events", () => {
  it("join_superstructure and leave_superstructure direct events return use_proposal", async () => {
    const head = await generateKeyPair();
    const ns = "legacy-super";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [head.publicKeyHex],
      balances: { [head.publicKeyHex]: points("1000") },
      head: head.publicKeyHex,
      parameters: DEFAULT_PARAMETERS,
    };

    const join = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: head.publicKeyHex,
        timestamp: 1,
        payload: { type: "join_superstructure", target: "parent-ns" },
      },
      head.privateKey,
    );
    const joinR = reduceOneSync(state, join);
    expect(joinR.ok).toBe(false);
    expect(joinR.reason).toBe("use_proposal");
    expect(joinR.state).toBe(state);

    const leave = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: { type: "leave_superstructure", target: "parent-ns" },
      },
      head.privateKey,
    );
    const leaveR = reduceOneSync(state, leave);
    expect(leaveR.ok).toBe(false);
    expect(leaveR.reason).toBe("use_proposal");
    expect(leaveR.state).toBe(state);
  });

  it("epoch_close is an idempotent no-op", async () => {
    const head = await generateKeyPair();
    const ns = "legacy-epoch";
    const state = {
      ...createInitialState(ns),
      initialized: true,
      members: [head.publicKeyHex],
      balances: { [head.publicKeyHex]: points("1000") },
      head: head.publicKeyHex,
      lastEpochTimestamp: 99,
      parameters: DEFAULT_PARAMETERS,
    };

    const evt = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: head.publicKeyHex,
        timestamp: 1,
        payload: { type: "epoch_close" },
      },
      head.privateKey,
    );
    const r = reduceOneSync(state, evt);
    expect(r.ok).toBe(true);
    expect(r.state.lastEpochTimestamp).toBe(99);
    expect(r.state.balances).toEqual(state.balances);
    expect(r.state.members).toEqual(state.members);
  });
});
