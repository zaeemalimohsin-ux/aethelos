import { describe, test, expect } from "vitest";
import { generateKeyPair, signEvent } from "../src/index.js";
import { reduceEvents } from "../src/reducer/index.js";
import type { SignedEvent } from "../src/schema/index.js";

describe("Adversarial Economics > Flash Loan Vote Stacking", () => {
  test("prevents an attacker from passing a proposal by passing the same 1 point between sybils", async () => {
    const founder = await generateKeyPair();

    // Attacker starts with 20 points!
    const attacker1 = await generateKeyPair();

    // Attacker's sybil nodes
    const sybils = await Promise.all(
      Array.from({ length: 5 }).map(() => generateKeyPair()),
    );

    const ns = "ns_flash_loan";
    let lastHash: string | null = null;
    let lamport = 0;
    const events: SignedEvent[] = [];

    const addEvent = async (
      payload: SignedEvent["payload"],
      author: Awaited<ReturnType<typeof generateKeyPair>>,
    ) => {
      lamport++;
      const ev = await signEvent(
        {
          namespaceId: ns,
          prevHash: lastHash,
          lamport,
          author: author.publicKeyHex,
          timestamp: lamport * 1000,
          payload,
        },
        author.privateKey,
      );
      events.push(ev);
      lastHash = ev.id;
    };

    // 1. Genesis with 100 points
    await addEvent(
      { type: "genesis", initialPoints: "100", cellName: "Flash Bank" },
      founder,
    );

    // 2. Founder transfers 20 points to Attacker1
    await addEvent({ type: "invite", invitee: attacker1.publicKeyHex }, founder);
    await addEvent(
      {
        type: "proposal_vote",
        proposalId: `admit:${attacker1.publicKeyHex}`,
        approve: true,
      },
      founder,
    );
    await addEvent({ type: "accept_invite", inviter: founder.publicKeyHex }, attacker1);
    await addEvent(
      { type: "transaction", to: attacker1.publicKeyHex, amount: "20" },
      founder,
    );

    // 3. Founder invites the 5 Sybils
    for (const sybil of sybils) {
      await addEvent({ type: "invite", invitee: sybil.publicKeyHex }, founder);
      await addEvent(
        {
          type: "proposal_vote",
          proposalId: `admit:${sybil.publicKeyHex}`,
          approve: true,
        },
        founder,
      );
      await addEvent({ type: "accept_invite", inviter: founder.publicKeyHex }, sybil);
    }

    // 4. Attacker creates a malicious proposal to expel the Founder
    const proposalId = "malicious_expel";
    await addEvent(
      {
        type: "proposal_create",
        proposalId,
        kind: "expel_member",
        data: { target: founder.publicKeyHex },
      },
      attacker1,
    );

    // 5. Attacker votes YES with 20 points
    await addEvent(
      {
        type: "proposal_vote",
        proposalId,
        approve: true,
      },
      attacker1,
    );

    // 6. Attacker passes their balance down the chain, taking a flash loan
    let currentHolder = attacker1;
    let amountToSend = 19.8; // Attacker has 20 points, send 19.8

    for (const sybil of sybils) {
      await addEvent(
        {
          type: "transaction",
          to: sybil.publicKeyHex,
          amount: amountToSend.toString(),
        },
        currentHolder,
      );

      await addEvent(
        {
          type: "proposal_vote",
          proposalId,
          approve: true,
        },
        sybil,
      );

      currentHolder = sybil;
      amountToSend -= 0.1; // Reduce slightly to avoid insufficient funds due to decay
    }

    // Reduce the events!
    const state = reduceEvents(ns, events);

    const proposal = state.proposals[proposalId];
    expect(proposal).toBeDefined();

    // Verify the Founder was NOT expelled
    expect(state.members).toContain(founder.publicKeyHex);

    // Dynamic vote calculation means currentVotesFor = 1 (since only the last Sybil has the 1 point at the end)
    // Even though 53 different accounts voted YES while holding 1 point!
    expect(proposal?.executed).toBe(false);
  });
});
