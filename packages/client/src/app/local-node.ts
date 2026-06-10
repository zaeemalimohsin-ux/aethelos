export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

export interface LocalNodeStatus {
  localUrl: string;
  publicUrl?: string;
  running: boolean;
  tunnelReady?: boolean;
  cloudflaredAvailable?: boolean;
}

export async function startLocalNode(): Promise<LocalNodeStatus | null> {
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<LocalNodeStatus>("start_local_node");
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[aethelos] startLocalNode failed", err);
    }
    return null;
  }
}

export async function stopLocalNode(): Promise<void> {
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
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<LocalNodeStatus>("local_node_status");
  } catch {
    return null;
  }
}

/** Poll until a public tunnel URL appears or timeout (desktop genesis / sharing). */
export async function waitForPublicTunnel(
  maxMs = 15000,
): Promise<LocalNodeStatus | null> {
  if (!isDesktopApp()) return null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await localNodeStatus();
    if (status?.publicUrl) return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  return localNodeStatus();
}
