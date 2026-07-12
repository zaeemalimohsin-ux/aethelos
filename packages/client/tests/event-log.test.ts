import { describe, it, expect } from "vitest";
import { generateKeyPair, signEvent, DEFAULT_PARAMETERS } from "@aethelos/core";
import {
  appendEvent,
  loadEvents,
  exportEventLog,
  importEventLog,
} from "../src/storage/event-log.js";

describe("event log storage", () => {
  it("appends and loads events by namespace", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-ns-1";
    const event = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Stored",
          initialPoints: "100",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    await appendEvent(event);
    const loaded = await loadEvents(ns);
    expect(loaded.some((e) => e.id === event.id)).toBe(true);
  });

  it("import deduplicates on re-import", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-import";
    const event = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Import",
          initialPoints: "50",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const json = JSON.stringify([event]);
    const first = await importEventLog(json, ns);
    expect(first.imported).toBe(1);
    const second = await importEventLog(json, ns);
    expect(second.imported).toBe(1);
    const all = await loadEvents(ns);
    expect(all.filter((e) => e.id === event.id)).toHaveLength(1);
  });

  it("export produces valid JSON array", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-export";
    const event = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Export",
          initialPoints: "10",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    await appendEvent(event);
    const exported = await exportEventLog(ns);
    const parsed = JSON.parse(exported);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe(event.id);
  });

  it("rejects invalid JSON on import", async () => {
    await expect(importEventLog("not json")).rejects.toThrow("invalid_json");
  });

  it("rejects non-array JSON on import", async () => {
    await expect(importEventLog('{"x":1}')).rejects.toThrow("invalid_log_format");
  });

  it("rejects orphan-only logs that lack causal roots", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-orphan";
    const orphan = await signEvent(
      {
        namespaceId: ns,
        prevHash: "ab".repeat(32),
        lamport: 2,
        author: kp.publicKeyHex,
        timestamp: 2,
        payload: {
          type: "slider_update",
          parameter: "decay_rate",
          value: 5,
        },
      },
      kp.privateKey,
    );
    await expect(importEventLog(JSON.stringify([orphan]), ns)).rejects.toThrow(
      "causal_orphan_log",
    );
  });

  it("imports reachable chain and skips orphan siblings", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-partial-ok";
    const g = await signEvent(
      {
        namespaceId: ns,
        prevHash: null,
        lamport: 1,
        author: kp.publicKeyHex,
        timestamp: 1,
        payload: {
          type: "genesis",
          cellName: "Partial",
          initialPoints: "10",
          parameters: DEFAULT_PARAMETERS,
        },
      },
      kp.privateKey,
    );
    const orphan = await signEvent(
      {
        namespaceId: ns,
        prevHash: "cd".repeat(32),
        lamport: 3,
        author: kp.publicKeyHex,
        timestamp: 3,
        payload: { type: "slider_update", parameter: "decay_rate", value: 4 },
      },
      kp.privateKey,
    );
    const result = await importEventLog(JSON.stringify([g, orphan]), ns);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const loaded = await loadEvents(ns);
    expect(loaded.some((e) => e.id === g.id)).toBe(true);
    expect(loaded.some((e) => e.id === orphan.id)).toBe(false);
  });

  it("imports one branch of a dual-fork tip (accepted residual)", async () => {
    const kp = await generateKeyPair();
    const ns = "storage-dual-fork";
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
    expect(result.imported).toBeGreaterThanOrEqual(2);
    const loaded = await loadEvents(ns);
    expect(loaded.some((e) => e.id === forkA.id)).toBe(true);
    expect(loaded.some((e) => e.id === forkB.id)).toBe(true);
  });
});
