import { describe, it, expect } from "vitest";
import { generateKeyPair, signEvent, DEFAULT_PARAMETERS } from "../src/index.js";
import { isValidWireEnvelope, isValidRelayMessage } from "../src/schema/validate.js";

describe("wire envelope security", () => {
  it("accepts envelope when namespace matches event", async () => {
    const kp = await generateKeyPair();
    const event = await signEvent(
      {
        namespaceId: "wire-ns",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Wire",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    expect(isValidWireEnvelope({ version: 1, namespaceId: "wire-ns", event })).toBe(true);
  });

  it("rejects envelope when namespace does not match event", async () => {
    const kp = await generateKeyPair();
    const event = await signEvent(
      {
        namespaceId: "event-ns",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Wire",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    expect(
      isValidWireEnvelope({
        version: 1,
        namespaceId: "envelope-ns",
        event,
      }),
    ).toBe(false);
  });

  it("rejects sync_batch when event namespace does not match message", async () => {
    const kp = await generateKeyPair();
    const event = await signEvent(
      {
        namespaceId: "event-ns",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Wire",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    expect(
      isValidRelayMessage({
        type: "sync_batch",
        namespaceId: "batch-ns",
        events: [event],
      }),
    ).toBe(false);
  });
});
