import { describe, it, expect } from "vitest";
import { generateKeyPair, signEvent, DEFAULT_PARAMETERS } from "../src/index.js";
import { isValidWireEnvelope } from "../src/schema/validate.js";

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

  it("documents envelope namespace mismatch is structurally allowed today", async () => {
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
    const allowed = isValidWireEnvelope({
      version: 1,
      namespaceId: "envelope-ns",
      event,
    });
    expect(allowed).toBe(true);
  });
});
