#!/usr/bin/env node
/**
 * Pick a deployable HF Space: primary unless PAUSED/flagged, else fallback (create if missing).
 * Requires HF_TOKEN. Writes GITHUB_OUTPUT when set.
 */
import { appendFileSync } from "node:fs";

const token = process.env.HF_TOKEN;
if (!token) {
  console.error("HF_TOKEN is required");
  process.exit(1);
}

const owner = process.env.HF_SPACE_OWNER || "TheGritz";
const primary = process.env.HF_SPACE_PRIMARY || "aethelos";
const fallback = process.env.HF_SPACE_FALLBACK || "aethelos-pwa";

async function hf(path, options = {}) {
  const res = await fetch(`https://huggingface.co/api/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function getRuntime(repo) {
  const { res, json, text } = await hf(`spaces/${repo}/runtime`);
  if (!res.ok) {
    throw new Error(`runtime ${repo}: HTTP ${res.status} ${text}`);
  }
  return json;
}

function isBlocked(runtime) {
  if (!runtime) return true;
  if (runtime.stage === "PAUSED") return true;
  const err = (runtime.errorMessage || "").toLowerCase();
  return err.includes("abusive") || err.includes("abuse");
}

async function spaceExists(repo) {
  const { res } = await hf(`spaces/${repo}`);
  return res.status === 200;
}

async function createSpace(name) {
  console.log(`Creating fallback Space ${owner}/${name}...`);
  const { res, json, text } = await hf("repos/create", {
    method: "POST",
    body: JSON.stringify({
      type: "space",
      name,
      sdk: "docker",
      private: false,
    }),
  });
  if (res.status === 409 || res.status === 403) {
    console.log(`create ${name}: HTTP ${res.status} (${text}) — assuming exists or pending`);
    return;
  }
  if (res.status === 402) {
    console.log(`create ${name}: HTTP 402 - Docker Spaces require HF PRO`);
    return;
  }
  if (!res.ok) {
    throw new Error(`create space ${name}: HTTP ${res.status} ${text}`);
  }
  console.log("Created:", json?.url || name);
}

function writeOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    appendFileSync(out, `${key}=${value}\n`);
  }
  console.log(`${key}=${value}`);
}

async function main() {
  const primaryRepo = `${owner}/${primary}`;
  const fallbackRepo = `${owner}/${fallback}`;

  let chosen = primaryRepo;
  let runtime;
  try {
    runtime = await getRuntime(primaryRepo);
    console.log(`Primary runtime: ${JSON.stringify(runtime)}`);
    if (isBlocked(runtime)) {
      console.log(`Primary ${primaryRepo} blocked (${runtime.stage}: ${runtime.errorMessage || "n/a"})`);
      if (!(await spaceExists(fallbackRepo))) {
        await createSpace(fallback);
      }
      if (await spaceExists(fallbackRepo)) {
        runtime = await getRuntime(fallbackRepo);
        console.log(`Fallback runtime: ${JSON.stringify(runtime)}`);
        chosen = fallbackRepo;
      }
    }
  } catch (err) {
    console.warn(`Primary check failed: ${err.message}`);
    if (!(await spaceExists(fallbackRepo))) {
      await createSpace(fallback);
    }
    if (await spaceExists(fallbackRepo)) {
      runtime = await getRuntime(fallbackRepo);
      chosen = fallbackRepo;
    }
  }

  const slug = chosen.replace("/", "-").toLowerCase();
  const url = `https://${slug}.hf.space`;
  writeOutput("hf_space_repo", chosen);
  writeOutput("aethelos_url", url);
  if (isBlocked(runtime)) {
    console.warn("Space still blocked; push continues, preflight will skip.");
    writeOutput("hf_space_blocked", "true");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
