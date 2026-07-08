import { Capacitor } from "@capacitor/core";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export interface LocalNodeStatus {
  localUrl: string;
  publicUrl?: string;
  running: boolean;
  tunnelReady?: boolean;
  cloudflaredAvailable?: boolean;
  startupError?: string;
}

export async function startLocalNode(): Promise<LocalNodeStatus | null> {
  if (isAndroidApp()) {
    return localNodeStatus();
  }
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<LocalNodeStatus>("start_local_node");
  } catch (err) {
    console.warn("[aethelos] startLocalNode failed", err);
    return null;
  }
}

export async function stopLocalNode(): Promise<void> {
  if (isAndroidApp()) return; // Managed by OS/App lifecycle
  if (!isDesktopApp()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_local_node");
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[aethelos] stopLocalNode failed", err);
    }
  }
}

export async function localNodeStatus(): Promise<LocalNodeStatus | null> {
  if (isAndroidApp()) {
    try {
      const res = await fetch("http://127.0.0.1:8787/android-tunnel");
      if (res.ok) {
        const data = await res.json();
        return {
          localUrl: "ws://127.0.0.1:8787",
          publicUrl: data.publicUrl || undefined,
          running: true,
          tunnelReady: !!data.publicUrl,
          cloudflaredAvailable: data.cloudflaredAvailable,
        };
      }
    } catch {
      return {
        localUrl: "ws://127.0.0.1:8787",
        running: false,
        tunnelReady: false,
        cloudflaredAvailable: false,
      };
    }
  }
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<LocalNodeStatus>("local_node_status");
  } catch {
    return null;
  }
}

export async function waitForPublicTunnel(
  maxMs = 120_000,
): Promise<LocalNodeStatus | null> {
  if (!isDesktopApp() && !isAndroidApp()) return null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await localNodeStatus();
    if (status?.publicUrl) return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  return localNodeStatus();
}

/** Write public share URL for automation scripts (desktop only). */
export async function writeShareUrlFile(url: string | null): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_share_url_file", { url: url ?? "" });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[aethelos] writeShareUrlFile failed", err);
    }
  }
}
