#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifySha256(filePath, expectedHex) {
  const actual = await sha256File(filePath);
  const expected = expectedHex.trim().toLowerCase();
  if (actual !== expected) {
    throw new Error(
      `SHA-256 mismatch for ${filePath}\n  expected: ${expected}\n  actual:   ${actual}`,
    );
  }
}
