import { describe, it, expect } from "vitest";
import {
  POINTS_SCALE,
  parsePointsAmount,
  formatPointsAmount,
  isValidPointsAmountString,
  points,
  tryParsePointsAmount,
} from "../src/money/points.js";

describe("points money", () => {
  it("parses whole numbers as scaled bigint", () => {
    expect(parsePointsAmount("10000")).toBe(10000n * POINTS_SCALE);
    expect(points("1")).toBe(POINTS_SCALE);
  });

  it("parses decimal strings up to 9 places", () => {
    expect(parsePointsAmount("1.25")).toBe(1250000000n);
    expect(parsePointsAmount("0.000000001")).toBe(1n);
    expect(parsePointsAmount("0.5")).toBe(500000000n);
  });

  it("rejects invalid amounts", () => {
    expect(isValidPointsAmountString("1.1234567890")).toBe(false);
    expect(isValidPointsAmountString("-1")).toBe(false);
    expect(isValidPointsAmountString("")).toBe(false);
    expect(isValidPointsAmountString("1.")).toBe(false);
    expect(tryParsePointsAmount("abc")).toBeNull();
  });

  it("formats with trimmed trailing zeros", () => {
    expect(formatPointsAmount(parsePointsAmount("10000"))).toBe("10000");
    expect(formatPointsAmount(parsePointsAmount("1.25"))).toBe("1.25");
    expect(formatPointsAmount(parsePointsAmount("0.000000001"))).toBe("0.000000001");
  });

  it("round-trips common values", () => {
    for (const human of ["0.5", "1.25", "999.999999999", "10000"]) {
      const parsed = parsePointsAmount(human);
      expect(formatPointsAmount(parsed)).toBe(human);
    }
  });
});
