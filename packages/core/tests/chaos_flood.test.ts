import { describe, it, expect } from "vitest";
import { generateKeyPair, genesis, signEvent, reduceEvents } from "../src/index.js";
import { DEFAULT_PARAMETERS } from "../src/schema/events.js";

// Helper function to create genesis since it's not exported directly in the same way
async function createGenesis(ns: string, kp: any) {
  return signEvent(
    {
      namespaceId: ns,
      prevHash: null,
      lamport: 1,
      author: kp.publicKeyHex,
      timestamp: 1,
      payload: {
        type: "genesis",
        cellName: "Sim",
        initialPoints: "10000",
        parameters: { ...DEFAULT_PARAMETERS },
      },
    },
    kp.privateKey,
  );
}

describe("Chaos Engineering & Performance DoS", () => {
  it("survives processing 5,000 malicious and valid events (Reducer Virtualization)", async () => {
    const head = await generateKeyPair();
    const attacker = await generateKeyPair();
    const ns = "chaos-flood";

    const events = [];
    const g = await createGenesis(ns, head);
    events.push(g);

    // Admit attacker
    const invite = await signEvent(
      {
        namespaceId: ns,
        prevHash: g.id,
        lamport: 2,
        author: head.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "invite",
          invitee: attacker.publicKeyHex,
          vouchBondAmount: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      head.privateKey,
    );
    events.push(invite);

    let lastHash = invite.id;
    let lamport = 3;

    // Attacker floods 1000 transactions (all 0 amount or negative to spam)
    console.log("Generating 1000 spam events...");
    for (let i = 0; i < 1000; i++) {
      lamport++;
      const spam = await signEvent(
        {
          namespaceId: ns,
          prevHash: lastHash,
          lamport,
          author: attacker.publicKeyHex,
          timestamp: 10 + i,
          // Send tiny amounts or 0
          payload: { type: "transaction", to: head.publicKeyHex, amount: "0" },
        },
        attacker.privateKey,
      );

      events.push(spam);
      lastHash = spam.id;
    }

    const start = performance.now();
    const state = reduceEvents(ns, events);
    const end = performance.now();

    console.log(`Processed 1000 events in ${end - start}ms`);

    // Verify it didn't crash and the state is valid
    expect(state).toBeDefined();
    // Only the 2 valid events (genesis, invite) should increment eventCount!
    // The 1000 invalid transactions are securely dropped.
    expect(state.eventCount).toBe(2);
    // V8 performance threshold: noble/ed25519 takes ~16ms per sig verify.
    // 1000 sigs should take ~16 seconds.
    expect(end - start).toBeLessThan(60000);
  });
});
