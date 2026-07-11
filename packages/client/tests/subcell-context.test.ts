import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSubCellParentContext,
  loadSubCellParentContext,
  clearSubCellParentContext,
} from "../src/app/subcell-context.js";
import { STORAGE_KEYS } from "../src/app/session-storage.js";

describe("subcell parent context", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists parent context in localStorage", () => {
    saveSubCellParentContext({
      parentNamespaceId: "b".repeat(64),
      parentCellName: "Ward Parent",
      parentRelayUrls: ["wss://localhost:8787"],
    });
    const loaded = loadSubCellParentContext();
    expect(loaded?.parentCellName).toBe("Ward Parent");
    expect(loaded?.parentNamespaceId).toBe("b".repeat(64));
    expect(localStorage.getItem(STORAGE_KEYS.subcellParent)).toContain("Ward Parent");
    clearSubCellParentContext();
    expect(loadSubCellParentContext()).toBeNull();
  });
});
