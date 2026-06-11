import { isLocalOnlyRelayUrl } from "@aethelos/core";
import { selectRelaysForCommunity, dedupeRelays } from "./bootstrap-relays.js";

export { dedupeRelays, isLocalOnlyRelayUrl };

export interface MergeActiveRelaysOptions {
  /** Community mailbox URLs the user chose to disconnect from (session-only). */
  ignoredCommunityRelays?: string[];
}

/** Relay list for signed invite links — excludes localhost-only URLs. */
export function relayUrlsForInvite(relayUrls: string[], namespaceId: string): string[] {
  const remote = dedupeRelays(relayUrls.filter((u) => !isLocalOnlyRelayUrl(u)));
  if (remote.length > 0) return remote;
  if (import.meta.env.DEV) return dedupeRelays(relayUrls);
  return selectRelaysForCommunity(namespaceId);
}

/** Merge session relays with ledger community mailboxes; bootstrap when both are empty. */
export function mergeActiveRelays(
  sessionRelays: string[],
  communityRelays: string[] | undefined,
  namespaceId: string,
  options: MergeActiveRelaysOptions = {},
): string[] {
  const ignored = new Set(options.ignoredCommunityRelays ?? []);
  const community = dedupeRelays((communityRelays ?? []).filter((u) => !ignored.has(u)));
  const session = dedupeRelays(sessionRelays);

  if (community.length > 0) {
    return dedupeRelays([...session, ...community]);
  }

  if (session.length > 0) {
    return session;
  }

  return selectRelaysForCommunity(namespaceId);
}

export function relaySetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Map https quick-tunnel URL to wss for WebSocket clients. */
export function httpsToWssRelayUrl(httpsUrl: string): string {
  const parsed = new URL(httpsUrl.trim());
  parsed.protocol = "wss:";
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export type TunnelStatus = "idle" | "ready" | "local_only" | "failed";

export function tunnelStatusFromLocalNode(
  running: boolean,
  publicUrl?: string,
  cloudflaredAvailable?: boolean,
): TunnelStatus {
  if (!running) return "idle";
  if (publicUrl) return "ready";
  if (cloudflaredAvailable === false) return "failed";
  return "local_only";
}

export function tunnelStatusMessage(status: TunnelStatus): string {
  switch (status) {
    case "ready":
      return "Ready for friends abroad — your mailbox is on the internet.";
    case "local_only":
      return "Local mailbox only — friends far away need cloudflared for a public tunnel.";
    case "failed":
      return "Tunnel failed — install cloudflared to invite friends far away.";
    default:
      return "Not sharing a mailbox from this computer.";
  }
}
