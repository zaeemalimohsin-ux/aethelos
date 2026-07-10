import { describe, expect, it } from "vitest";
import { isValidPublicKeyHex } from "../src/app/format.js";

describe("isValidPublicKeyHex", () => {
  const valid = "a".repeat(64);

  it("accepts 64-char hex", () => {
    expect(isValidPublicKeyHex(valid)).toBe(true);
    expect(isValidPublicKeyHex(valid.toUpperCase())).toBe(true);
    expect(isValidPublicKeyHex(`  ${valid}  `)).toBe(true);
  });

  it("rejects short or non-hex", () => {
    expect(isValidPublicKeyHex("invalid_code")).toBe(false);
    expect(isValidPublicKeyHex("abc")).toBe(false);
    expect(isValidPublicKeyHex(`${valid}0`)).toBe(false);
  });
});
