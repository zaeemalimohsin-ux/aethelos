import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  reduceWithSnapshot,
  totalPoolPoints,
  isValidRelayMessage,
  isValidWireEnvelope,
  DEFAULT_PARAMETERS,
  MS_PER_MINUTE,
  type KeyPair,
  type SignedEvent,
  type UnsignedEvent,
  type EventPayload,
  points,
} from "../src/index.js";
import { admissionApprovalVote } from "./admission-helpers.js";

/** Deterministic PRNG so failures are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Build a properly-signed, hash-linked chain of events from multiple authors. */
async function buildChain(
  ns: string,
  steps: { author: KeyPair; payload: EventPayload }[],
): Promise<SignedEvent[]> {
  const events: SignedEvent[] = [];
  let lamport = 0;
  let prevHash: string | null = null;
  for (const step of steps) {
    lamport += 1;
    const unsigned: UnsignedEvent = {
      namespaceId: ns,
      prevHash,
      lamport,
      author: step.author.publicKeyHex,
      timestamp: lamport * MS_PER_MINUTE,
      payload: step.payload,
    };
    const signed = await signEvent(unsigned, step.author.privateKey);
    events.push(signed);
    prevHash = signed.id;
  }
  return events;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const rnd = lcg(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe("multi-node convergence", () => {
  it("all nodes derive identical state regardless of arrival order", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const c = await generateKeyPair();
    const ns = "sim-converge";
    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 15 };

    const events = await buildChain(ns, [
      {
        author: a,
        payload: {
          type: "genesis",
          cellName: "Sim",
          initialPoints: "10000",
          parameters: params,
        },
      },
      {
        author: a,
        payload: {
          type: "invite",
          invitee: b.publicKeyHex,
          vouchBondAmount: "500",
          parameters: params,
        },
      },
      admissionApprovalVote(a, b.publicKeyHex),
      { author: b, payload: { type: "accept_invite", inviter: a.publicKeyHex } },
      {
        author: a,
        payload: {
          type: "invite",
          invitee: c.publicKeyHex,
          vouchBondAmount: "1000",
          parameters: params,
        },
      },
      admissionApprovalVote(a, c.publicKeyHex),
      { author: c, payload: { type: "accept_invite", inviter: a.publicKeyHex } },
      { author: a, payload: { type: "transaction", to: b.publicKeyHex, amount: "300" } },
      { author: a, payload: { type: "transaction", to: c.publicKeyHex, amount: "200" } },
      { author: b, payload: { type: "transaction", to: c.publicKeyHex, amount: "50" } },
      { author: c, payload: { type: "transaction", to: a.publicKeyHex, amount: "25" } },
      {
        author: a,
        payload: { type: "slider_update", parameter: "decay_rate", value: 5 },
      },
    ]);

    const canonical = reduceEvents(ns, events);
    for (let seed = 1; seed <= 25; seed++) {
      const shuffled = reduceEvents(ns, shuffle(events, seed));
      expect(shuffled.balances).toEqual(canonical.balances);
      expect(shuffled.epochNumber).toBe(canonical.epochNumber);
      expect(shuffled.commons).toBe(canonical.commons);
      expect(shuffled.head).toBe(canonical.head);
    }
  }, 120_000);
});

describe("integer conservation at scale", () => {
  it("transfers, decay, and redistribution never change the total", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const ns = "sim-conserve";
    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 15, decay_rate: 10 };

    const steps = [
      {
        author: a,
        payload: {
          type: "genesis",
          cellName: "C",
          initialPoints: "100000",
          parameters: params,
        } as EventPayload,
      },
      {
        author: a,
        payload: {
          type: "invite",
          invitee: b.publicKeyHex,
          vouchBondAmount: "5000",
          parameters: params,
        } as EventPayload,
      },
      admissionApprovalVote(a, b.publicKeyHex),
      {
        author: b,
        payload: { type: "accept_invite", inviter: a.publicKeyHex } as EventPayload,
      },
    ];
    const rnd = lcg(99);
    for (let i = 0; i < 40; i++) {
      const fromA = rnd() > 0.5;
      steps.push({
        author: fromA ? a : b,
        payload: {
          type: "transaction",
          to: fromA ? b.publicKeyHex : a.publicKeyHex,
          amount: String(1 + Math.floor(rnd() * 50)),
        } as EventPayload,
      });
    }

    const events = await buildChain(ns, steps);
    const state = reduceEvents(ns, events);

    // Only genesis mints; everything else conserves. Total must equal the mint.
    expect(totalPoolPoints(state)).toBe(points("100000"));
    expect(state.epochNumber).toBeGreaterThan(0);
  });
});

describe("snapshot reduction equivalence", () => {
  it("incremental snapshot reduction matches full replay as events stream in", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const ns = "sim-snapshot";
    const params = { ...DEFAULT_PARAMETERS, epoch_interval: 15 };
    const events = await buildChain(ns, [
      {
        author: a,
        payload: {
          type: "genesis",
          cellName: "S",
          initialPoints: "10000",
          parameters: params,
        },
      },
      {
        author: a,
        payload: {
          type: "invite",
          invitee: b.publicKeyHex,
          vouchBondAmount: "500",
          parameters: params,
        },
      },
      admissionApprovalVote(a, b.publicKeyHex),
      { author: b, payload: { type: "accept_invite", inviter: a.publicKeyHex } },
      { author: a, payload: { type: "transaction", to: b.publicKeyHex, amount: "100" } },
      { author: b, payload: { type: "transaction", to: a.publicKeyHex, amount: "40" } },
      { author: a, payload: { type: "transaction", to: b.publicKeyHex, amount: "10" } },
      { author: a, payload: { type: "transaction", to: b.publicKeyHex, amount: "5" } },
    ]);

    let snap = reduceWithSnapshot(ns, events.slice(0, 3));
    snap = reduceWithSnapshot(ns, events.slice(0, 5), snap);
    snap = reduceWithSnapshot(ns, events, snap);

    const full = reduceEvents(ns, events);
    expect(snap.state.balances).toEqual(full.balances);
    expect(snap.state.epochNumber).toBe(full.epochNumber);
  });
});

describe("wire parser fuzzing", () => {
  it("validators reject garbage and never throw", () => {
    const rnd = lcg(7);
    const garbage = [
      null,
      undefined,
      42,
      "string",
      [],
      {},
      { type: "announce" },
      { type: "announce", envelope: {} },
      { type: "sync_batch", namespaceId: "x", events: [{}] },
      { type: "request_sync" },
      { type: "unknown" },
      { type: "announce", envelope: { version: 999, namespaceId: "x", event: {} } },
    ];
    for (const g of garbage) {
      expect(() => isValidRelayMessage(g)).not.toThrow();
      expect(isValidRelayMessage(g)).toBe(false);
    }
    // Random structured noise.
    for (let i = 0; i < 200; i++) {
      const noise: Record<string, unknown> = {};
      const keys = ["type", "envelope", "events", "namespaceId", "version", "x"];
      for (const k of keys) {
        if (rnd() > 0.5) noise[k] = rnd() > 0.5 ? rnd() : `${rnd()}`;
      }
      expect(() => isValidRelayMessage(noise)).not.toThrow();
      expect(() => isValidWireEnvelope(noise)).not.toThrow();
    }
  });

  it("reducer ignores unverifiable events without throwing", async () => {
    const a = await generateKeyPair();
    const ns = "fuzz-reduce";
    const good = await buildChain(ns, [
      {
        author: a,
        payload: {
          type: "genesis",
          cellName: "F",
          initialPoints: "1000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
    ]);
    // Tamper: flip the signature so verification fails.
    const tampered: SignedEvent = { ...good[0]!, signature: "00".repeat(64) };
    expect(() => reduceEvents(ns, [tampered])).not.toThrow();
    const state = reduceEvents(ns, [tampered]);
    expect(state.initialized).toBe(false);
  });
});

describe("random event sequences", () => {
  it("conserves total points across shuffled transfer order", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const ns = "random-conservation";
    const rnd = lcg(42);

    const baseSteps: { author: KeyPair; payload: EventPayload }[] = [
      {
        author: a,
        payload: {
          type: "genesis",
          cellName: "Rand",
          initialPoints: "10000",
          parameters: { ...DEFAULT_PARAMETERS, epoch_interval: 60 },
        },
      },
      {
        author: a,
        payload: {
          type: "invite",
          invitee: b.publicKeyHex,
          lienAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      admissionApprovalVote(a, b.publicKeyHex),
      { author: b, payload: { type: "accept_invite", inviter: a.publicKeyHex } },
    ];

    for (let i = 0; i < 20; i++) {
      const fromA = rnd() > 0.5;
      baseSteps.push({
        author: fromA ? a : b,
        payload: {
          type: "transaction",
          to: fromA ? b.publicKeyHex : a.publicKeyHex,
          amount: "1",
        },
      });
    }

    const events = await buildChain(ns, baseSteps);
    const totals = [
      totalPoolPoints(reduceEvents(ns, events)),
      totalPoolPoints(reduceEvents(ns, shuffle(events, 11))),
      totalPoolPoints(reduceEvents(ns, shuffle(events, 99))),
    ];
    expect(totals[0]).toBe(points("10000"));
    expect(totals[0]).toBe(totals[1]);
    expect(totals[1]).toBe(totals[2]);
  });
});
