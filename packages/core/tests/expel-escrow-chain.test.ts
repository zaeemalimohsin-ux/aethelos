import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signEvent,
  reduceEvents,
  totalPoolPoints,
  admissionProposalId,
  DEFAULT_PARAMETERS,
  getBalance,
  type SignedEvent,
} from "../src/index.js";

async function push(
  events: SignedEvent[],
  prev: { current: string | null },
  lamport: { n: number },
  author: Awaited<ReturnType<typeof generateKeyPair>>,
  payload: SignedEvent["payload"],
) {
  lamport.n += 1;
  const e = await signEvent(
    {
      namespaceId: events[0]!.namespaceId,
      prevHash: prev.current,
      lamport: lamport.n,
      author: author.publicKeyHex,
      timestamp: lamport.n,
      payload,
    },
    author.privateKey,
  );
  events.push(e);
  prev.current = e.id;
  return e;
}

describe("multi-hop expulsion escrow chain", () => {
  it("routes C expulsion escrow to direct parent B, then bridge_transfer toward A", async () => {
    const headA = await generateKeyPair();
    const headB = await generateKeyPair();
    const headC = await generateKeyPair();
    const expelled = await generateKeyPair();

    const nsA = "chain-a";
    const nsB = "chain-b";
    const nsC = "chain-c";

    const eventsB: SignedEvent[] = [];
    const prevB = { current: null as string | null };
    const lamB = { n: 0 };
    const gB = await signEvent(
      {
        namespaceId: nsB,
        prevHash: null,
        lamport: 1,
        author: headB.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "B",
          initialPoints: "5000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      headB.privateKey,
    );
    eventsB.push(gB);
    prevB.current = gB.id;
    lamB.n = 1;
    await push(eventsB, prevB, lamB, headB, {
      type: "proposal_create",
      proposalId: "join-a",
      kind: "join_superstructure",
      data: { target: nsA },
    });
    await push(eventsB, prevB, lamB, headB, {
      type: "proposal_vote",
      proposalId: "join-a",
      approve: true,
    });
    let stateB = reduceEvents(nsB, eventsB);
    expect(stateB.parentSuperstructures).toContain(nsA);

    const eventsC: SignedEvent[] = [];
    const prevC = { current: null as string | null };
    const lamC = { n: 0 };
    const gC = await signEvent(
      {
        namespaceId: nsC,
        prevHash: null,
        lamport: 1,
        author: headC.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "C",
          initialPoints: "5000",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      headC.privateKey,
    );
    eventsC.push(gC);
    prevC.current = gC.id;
    lamC.n = 1;
    await push(eventsC, prevC, lamC, headC, {
      type: "proposal_create",
      proposalId: "join-b",
      kind: "join_superstructure",
      data: { target: nsB },
    });
    await push(eventsC, prevC, lamC, headC, {
      type: "proposal_vote",
      proposalId: "join-b",
      approve: true,
    });

    await push(eventsC, prevC, lamC, headC, {
      type: "invite",
      invitee: expelled.publicKeyHex,
      vouchBondAmount: "200",
      parameters: DEFAULT_PARAMETERS,
    });
    await push(eventsC, prevC, lamC, headC, {
      type: "proposal_vote",
      proposalId: admissionProposalId(expelled.publicKeyHex),
      approve: true,
    });
    await push(eventsC, prevC, lamC, expelled, {
      type: "accept_invite",
      inviter: headC.publicKeyHex,
    });
    await push(eventsC, prevC, lamC, headC, {
      type: "transaction",
      to: expelled.publicKeyHex,
      amount: "800",
    });

    const beforeTotalC = totalPoolPoints(reduceEvents(nsC, eventsC));

    await push(eventsC, prevC, lamC, headC, {
      type: "proposal_create",
      proposalId: "expel-member",
      kind: "expel_member",
      data: { target: expelled.publicKeyHex },
    });
    await push(eventsC, prevC, lamC, headC, {
      type: "proposal_vote",
      proposalId: "expel-member",
      approve: true,
    });

    const stateC = reduceEvents(nsC, eventsC);
    expect(stateC.members).not.toContain(expelled.publicKeyHex);
    expect(totalPoolPoints(stateC)).toBe(beforeTotalC);
    expect(stateC.superstructureEscrow[nsB] ?? 0n).toBeGreaterThan(0n);
    expect(getBalance(stateC, expelled.publicKeyHex)).toBe(0n);

    const escrowOnC = stateC.superstructureEscrow[nsB]!;
    await push(eventsB, prevB, lamB, headB, {
      type: "proposal_create",
      proposalId: "bridge-up",
      kind: "bridge_transfer",
      data: { target: nsA, to: headA.publicKeyHex, amount: escrowOnC.toString() },
    });
    await push(eventsB, prevB, lamB, headB, {
      type: "proposal_vote",
      proposalId: "bridge-up",
      approve: true,
    });
    stateB = reduceEvents(nsB, eventsB);
    expect(stateB.proposals["bridge-up"]?.executed).toBe(true);
    void headA;
  });
});
