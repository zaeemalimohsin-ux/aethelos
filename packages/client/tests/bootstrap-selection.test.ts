import { describe, it, expect } from "vitest";
import {
  pickBootstrapRelaysFromPool,
  selectRelaysForCommunity,
  getBootstrapRelayPool,
  isValidRelayUrl,
  relayHealthUrl,
  resolveRelaysForCommunity,
} from "../src/app/bootstrap-relays.js";

const POOL = [
  "wss://a.example",
  "wss://b.example",
  "wss://c.example",
  "wss://d.example",
  "wss://e.example",
  "wss://f.example",
  "wss://g.example",
  "wss://h.example",
];

describe("relay bootstrap selection", () => {
  it("picks deterministically and spreads communities across the pool", () => {
    const a = pickBootstrapRelaysFromPool("ns-alpha", POOL, 3);
    const b = pickBootstrapRelaysFromPool("ns-alpha", POOL, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);

    const sets = ["aaa", "bbb", "ccc", "ddd", "eee"].map((id) =>
      pickBootstrapRelaysFromPool(id, POOL, 3).join("|"),
    );
    expect(new Set(sets).size).toBeGreaterThan(1);

    const custom = selectRelaysForCommunity("ns-1", {
      customRelay: "wss://mine.example",
      poolOverride: POOL.slice(0, 4),
    });
    expect(custom[0]).toBe("wss://mine.example");

    // DEV mode (vitest): empty pool falls back to localhost.
    expect(selectRelaysForCommunity("ns-local", { poolOverride: [] })).toEqual([
      "ws://localhost:8787",
    ]);
    expect(getBootstrapRelayPool()).toEqual(["ws://localhost:8787"]);
  });

  it("validates relay URLs and resolves without probing by default", async () => {
    expect(isValidRelayUrl("wss://relay.example.org")).toBe(true);
    expect(isValidRelayUrl("https://relay.example.org")).toBe(false);
    expect(relayHealthUrl("ws://localhost:8787")).toBe("http://localhost:8787/healthz");

    const relays = await resolveRelaysForCommunity("ns-probe-off", { poolOverride: POOL });
    expect(relays).toHaveLength(3);
  });
});
