import { describe, it, expect } from "vitest";
import { pickBootstrapRelaysFromPool } from "../src/app/bootstrap-relays.js";

describe("bootstrap pool (prod empty fallback)", () => {
  it("returns empty when prod pool has no configured relays", () => {
    const picked = pickBootstrapRelaysFromPool("ns-empty", [], 3);
    expect(picked).toEqual([]);
  });
});
