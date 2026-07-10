import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const bridgePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/app/test-bridge.ts",
);

describe("test-bridge production guard", () => {
  it("installTestBridge rejects PROD without E2E in source", () => {
    const src = readFileSync(bridgePath, "utf8");
    expect(src).toContain("Test bridge cannot run in production builds");
    expect(src).toMatch(/import\.meta\.env\.PROD/);
    expect(src).toMatch(/VITE_E2E/);
  });
});
