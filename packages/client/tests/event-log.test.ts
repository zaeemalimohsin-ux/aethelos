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
});
