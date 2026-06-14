import { isLocalOnlyRelayUrl } from "@aethelos/core";
import {
  selectRelaysForCommunity,
  dedupeRelays,
  sameOriginRelayUrl,
} from "./bootstrap-relays.js";

export { dedupeRelays, isLocalOnlyRelayUrl };

export interface MergeActiveRelaysOptions {
  /** Community mailbox URLs the user chose to disconnect from (session-only). */
  ignoredCommunityRelays?: string[];
}

/** Relay list for signed invite links — excludes localhost-only URLs. */
export function relayUrlsForInvite(relayUrls: string[], namespaceId: string): string[] {
  const remote = dedupeRelays(relayUrls.filter((u) => !isLocalOnlyRelayUrl(u)));
  if (remote.length > 0) return remote;
  const sameOrigin = sameOriginRelayUrl();
  if (sameOrigin && !isLocalOnlyRelayUrl(sameOrigin)) return [sameOrigin];
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

/** Map public app URL to same-origin wss relay (/ws). */
export function httpsToWssRelayUrl(httpsUrl: string): string {
  const parsed = new URL(httpsUrl.trim());
  parsed.protocol = "wss:";
  parsed.pathname = "/ws";
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
      return "Public reach is ready — invite links work on phone and desktop.";
    case "local_only":
      return "Reachable on this network only. See Advanced → Network for a public address.";
    case "failed":
      return "Could not open public reach yet. Try again under Advanced → Network.";
    default:
      return "Not hosting from this device.";
  }
}

export type SyncOverall = "online" | "connecting" | "offline";

/** Plain-language connection line for the happy path (no relay/mailbox jargon). */
export function connectionStatusMessage(
  overall: SyncOverall | undefined,
  pendingOutbox = 0,
): string {
  if (overall === "online") {
    return pendingOutbox > 0
      ? "Connected — sending queued actions…"
      : "Connected to your community.";
  }
  if (overall === "connecting") return "Connecting…";
  return "Offline — your actions queue until you're back online.";
}
