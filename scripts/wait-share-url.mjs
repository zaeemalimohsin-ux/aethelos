#!/usr/bin/env node
/**
 * Wait for desktop public share URL (.share-url file or CDP scrape).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_CDP_URL,
  ensurePublicMailbox,
  isValidPublicShareUrl,
  proofRoot,
  verifyReachable,
  waitForCdp,
  waitForLocalStack,
} from "./proof-desktop-lib.mjs";

const root = proofRoot;
const mode = (process.env.AETHELOS_PROOF_MODE || "dev").trim();
const shareFile = process.env.AETHELOS_SHARE_URL_FILE?.trim() || join(root, ".share-url");
const maxMs = Number(process.env.AETHELOS_SHARE_URL_WAIT_MS || 240_000);
const cdpUrl = process.env.AETHELOS_CDP_URL || DEFAULT_CDP_URL;
const fallbackPort = mode === "release" ? 8080 : 5173;

function readShareFile() {
  if (!existsSync(shareFile)) return null;
  const url = readFileSync(shareFile, "utf8").trim();
  return isValidPublicShareUrl(url) ? url : null;
}

async function readFromCdp(mode) {
  if (mode === "release") {
    try {
      const res = await fetch(`${cdpUrl}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return null;
    } catch {
      return null;
    }
  } else if (mode !== "dev") {
    return null;
  } else {
    try {
      const res = await fetch(`${cdpUrl}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return null;
    } catch {
      return null;
    }
  }

  const require = createRequire(join(root, "packages", "client", "package.json"));
  const { chromium } = require("playwright");

  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        if (mode === "dev" && !/localhost:517[34]/.test(page.url())) continue;
        await ensurePublicMailbox(page).catch(async () => {
          const getLink = page.getByRole("button", { name: /Get share link/i });
          if (await getLink.isVisible().catch(() => false)) {
            await getLink.click().catch(() => {});
            await page.waitForTimeout(5000);
          }
        });
        const textarea = page.locator('[data-testid="share-url"]');
        if (await textarea.isVisible().catch(() => false)) {
          const value = (await textarea.inputValue()).trim();
          if (isValidPublicShareUrl(value)) return value;
        }
        const getLink = page.getByRole("button", { name: /Get share link/i });
        if (await getLink.isVisible().catch(() => false)) {
          await getLink.click().catch(() => {});
        }
        if (await textarea.isVisible().catch(() => false)) {
          const value = (await textarea.inputValue()).trim();
          if (isValidPublicShareUrl(value)) return value;
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return null;
}

async function main() {
  if (mode !== "release") {
    await waitForLocalStack(mode);
  }
  if (mode === "dev" || mode === "release") {
    await waitForCdp(cdpUrl, Math.min(maxMs, 360_000));
  }

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const fromFile = readShareFile();
    if (fromFile) {
      try {
        await verifyReachable(fromFile, fallbackPort);
        console.log(fromFile);
        return;
      } catch {
        /* tunnel may still be warming up */
      }
    }
    const fromCdp = await readFromCdp(mode);
    if (fromCdp) {
      try {
        await verifyReachable(fromCdp, fallbackPort);
        console.log(fromCdp);
        return;
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Timed out waiting for share URL (${shareFile}${mode === "dev" || mode === "release" ? " or CDP" : ""})`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
