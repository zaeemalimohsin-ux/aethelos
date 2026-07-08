import { spawn, execSync } from "node:child_process";
import { copyFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import os from "node:os";

let publicUrl: string | null = null;
let tunnelAvailable = false;

export function isQuickTunnelUrl(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  const host = url.replace("https://", "").split("/")[0] ?? "";
  if (!host.endsWith(".trycloudflare.com")) return false;
  const subdomain = host.replace(".trycloudflare.com", "");
  return subdomain.length > 0 && subdomain !== "api" && !subdomain.includes(".");
}

export function extractHttpsUrl(line: string): string | null {
  const idx = line.indexOf("https://");
  if (idx !== -1) {
    const rest = line.substring(idx);
    const match = rest.match(/^https:\/\/[a-zA-Z0-9-.]+/);
    if (match) {
      const url = match[0];
      if (isQuickTunnelUrl(url)) {
        return url;
      }
    }
  }
  return null;
}

export function getPublicUrl(): string | null {
  return publicUrl;
}

export function isTunnelAvailable(): boolean {
  return tunnelAvailable;
}

export function startAndroidTunnel(targetPort: number): void {
  let baseDir = process.cwd();
  if (typeof __dirname !== "undefined") {
    baseDir = __dirname;
  }
  
  const arch = os.arch();
  const binName = arch === "arm64" ? "cloudflared-linux-arm64"
                : arch === "x64" ? "cloudflared-linux-amd64"
                : "cloudflared-linux-386";

  const sourceBin = join(baseDir, binName);
  
  if (!existsSync(sourceBin)) {
    console.warn(`[android-tunnel] source binary not found at ${sourceBin}`);
    return;
  }

  const targetBin = join(tmpdir(), "cloudflared_aethelos");
  
  try {
    execSync("pkill -f cloudflared", { stdio: "ignore" });
  } catch {}

  try {
    copyFileSync(sourceBin, targetBin);
    chmodSync(targetBin, 0o755);
    tunnelAvailable = true;
  } catch (err: any) {
    if (err.code === "ETXTBSY") {
      // Binary is already executing. We will just reuse it.
      tunnelAvailable = true;
    } else {
      console.error("[android-tunnel] Failed to setup binary:", err);
      return;
    }
  }

  console.log(`[android-tunnel] Spawning ${targetBin} -> ${targetPort}`);
  const child = spawn(targetBin, ["tunnel", "--url", `http://127.0.0.1:${targetPort}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onData = (data: Buffer) => {
    const text = data.toString();
    const url = extractHttpsUrl(text);
    if (url && !publicUrl) {
      publicUrl = url;
      console.log("[android-tunnel] Extracted Public URL:", publicUrl);
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("error", (err) => {
    console.error("[android-tunnel] child error:", err);
  });
}
