import { generateNamespaceId } from "../node/controller.js";
import { resolveRelaysForCommunity } from "./session.js";
import { tunnelStatusFromLocalNode, type TunnelStatus } from "./active-relays.js";
import { isDesktopApp, startLocalNode, waitForPublicTunnel } from "./local-node.js";

export interface EnsureOnlineResult {
  ok: boolean;
  relays: string[];
  publicUrl?: string;
  tunnelStatus: TunnelStatus;
}

/** Silent connectivity setup — desktop sidecar, same-origin, or bootstrap pool. */
export async function ensureOnline(options?: {
  namespaceId?: string;
  customRelay?: string;
  probe?: boolean;
  /** When true, only attempt desktop sidecar (no bootstrap fallback). */
  desktopOnly?: boolean;
}): Promise<EnsureOnlineResult> {
  const namespaceId = options?.namespaceId ?? generateNamespaceId();
  let relays: string[] = [];
  let publicUrl: string | undefined;
  let tunnelStatus: TunnelStatus = "idle";

  if (isDesktopApp()) {
    const node = await startLocalNode();
    if (node?.localUrl) {
      relays = [node.localUrl];
      const withTunnel = await waitForPublicTunnel(120_000);
      publicUrl = withTunnel?.publicUrl;
      tunnelStatus = tunnelStatusFromLocalNode(
        true,
        publicUrl,
        withTunnel?.cloudflaredAvailable ?? node.cloudflaredAvailable,
      );
    }
  }

  if (relays.length === 0 && !options?.desktopOnly) {
    relays = await resolveRelaysForCommunity(namespaceId, {
      ...(options?.customRelay ? { customRelay: options.customRelay } : {}),
      probe: options?.probe ?? !import.meta.env.DEV,
    });
  }

  const ok = options?.desktopOnly ? relays.length > 0 : relays.length > 0;

  return {
    ok,
    relays,
    ...(publicUrl !== undefined ? { publicUrl } : {}),
    tunnelStatus,
  };
}
