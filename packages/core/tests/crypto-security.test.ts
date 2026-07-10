import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  verifyEventSync,
  hashEvent,
  canonicalJson,
  reduceOneSync,
  createInitialState,
  DEFAULT_PARAMETERS,
} from "../src/index.js";

describe("verifyEventSync security", () => {
  it("rejects event id tamper with preserved signature", async () => {
    const kp = await generateKeyPair();
    const event = await signEvent(
      {
        namespaceId: "sec-ns",
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Tamper",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const tampered = {
      ...event,
      payload: { ...event.payload, initialPoints: "9999" },
    };
    expect(verifyEventSync(tampered)).toBe(false);
    expect(tampered.id).not.toBe(hashEvent(tampered));
  });

  it("rejects author field swap without re-signing", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const event = await signEvent(
      {
        namespaceId: "sec-ns",
        prevHash: null,
        lamport: 1,
        author: alice.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Swap",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      alice.privateKey,
    );
    const swapped = { ...event, author: bob.publicKeyHex };
    expect(verifyEventSync(swapped)).toBe(false);
    const state = createInitialState("sec-ns");
    const result = reduceOneSync(state, swapped);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_signature");
  });

  it("canonical JSON key order is stable for hashing", () => {
    const a = canonicalJson({ z: 1, a: 2, m: 3 });
    const b = canonicalJson({ a: 2, m: 3, z: 1 });
    expect(a).toBe(b);
  });
});
