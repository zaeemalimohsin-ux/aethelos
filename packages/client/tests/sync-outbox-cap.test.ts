import { describe, it, expect } from "vitest";
import { SyncEngine } from "../src/sync/engine.js";
import { generateKeyPair } from "@aethelos/core";

const MAX_OUTBOX = 500;

describe("sync engine outbox cap", () => {
  it("reports outboxAtCap when queue is full", async () => {
    const kp = await generateKeyPair();
    const ns = "outbox-cap";
    const engine = new SyncEngine(["ws://127.0.0.1:9/ws"], ns, kp);
    const filler = Array.from({ length: MAX_OUTBOX }, (_, i) => ({
      version: 1 as const,
      namespaceId: ns,
      event: { id: `evt-${i}` },
    }));
    (engine as unknown as { outbox: typeof filler }).outbox = filler;
    expect(engine.getStatus().outboxAtCap).toBe(true);
    expect(engine.getStatus().pendingOutbox).toBe(MAX_OUTBOX);
  });
});