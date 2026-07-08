/**
 * Invite links encode everything Person B needs to join Person A's Cell:
 * relay URLs, namespace ID, inviter public key, and cell name. No central
 * service is involved; the link is self-contained and shared peer-to-peer.
 *
 * When `sig` is present it is an Ed25519 signature over the canonical invite
 * body by `inviter`, so recipients can detect tampered relay URLs or namespace IDs.
 */
import {
  canonicalJson,
  signMessage,
  verifySignatureSync,
  type KeyPair,
} from "@aethelos/core";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { isValidPublicShareUrl } from "./public-share-url.js";

export interface InvitePayload {
  v: 1;
  ns: string;
  inviter: string;
  cell: string;
  relays: string[];
  /** Hex Ed25519 signature by inviter over the canonical body (optional for legacy links). */
  sig?: string;
}

const HASH_PREFIX = "#/join?d=";

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when the invite link points at a client shell only reachable on this machine. */
export function isLocalInviteOrigin(url: string): boolean {
  try {
    const parsed = new URL(url.split("#")[0] ?? url);
    return LOCAL_HTTP_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Client shell URL for invite links — configurable for desktop founders sharing remotely. */
export function inviteLinkBase(): string {
  const configured = import.meta.env.VITE_INVITE_BASE_URL?.trim();
  const onPublicShell =
    typeof window !== "undefined" &&
    typeof window.location?.hostname === "string" &&
    !LOCAL_HTTP_HOSTS.has(window.location.hostname.toLowerCase());
  if (configured && !(onPublicShell && isLocalInviteOrigin(configured))) {
    return configured.replace(/\/$/, "");
  }
  const path = window.location.pathname.replace(/\/?$/, "");
  return `${window.location.origin}${path}` || window.location.origin;
}

function toBase64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return decodeURIComponent(escape(atob(b64)));
}

export function inviteCanonicalBody(payload: Omit<InvitePayload, "sig">): string {
  return canonicalJson({
    v: payload.v,
    ns: payload.ns,
    inviter: payload.inviter,
    cell: payload.cell,
    relays: [...payload.relays].sort(),
  });
}

export async function signInvitePayload(
  payload: Omit<InvitePayload, "sig">,
  keyPair: KeyPair,
): Promise<InvitePayload> {
  const body = inviteCanonicalBody({ ...payload, v: 1 });
  const sigBytes = await signMessage(keyPair.privateKey, utf8ToBytes(body));
  return { ...payload, v: 1, sig: bytesToHex(sigBytes) };
}

export function verifyInviteSignature(payload: InvitePayload): boolean {
  if (!payload.sig) return false;
  const { sig: _sig, ...rest } = payload;
  const message = utf8ToBytes(inviteCanonicalBody(rest));
  return verifySignatureSync(payload.inviter, message, payload.sig);
}

export function encodeInvite(payload: InvitePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Prefer a public share/tunnel URL for invite links when available. */
export function resolveInviteLinkBase(options?: { publicShellUrl?: string }): string {
  const publicUrl = options?.publicShellUrl?.trim();
  if (publicUrl && isValidPublicShareUrl(publicUrl)) {
    return new URL(publicUrl).origin;
  }
  return inviteLinkBase();
}

export function buildInviteLink(payload: InvitePayload, linkBase?: string): string {
  const base =
    linkBase !== undefined
      ? resolveInviteLinkBase({ publicShellUrl: linkBase })
      : inviteLinkBase();
  return `${base}${HASH_PREFIX}${encodeInvite(payload)}`;
}

export function decodeInvite(encoded: string): InvitePayload | null {
  try {
    // Prevent DoS attacks by rejecting excessively large payloads
    // A typical invite is ~500-800 bytes base64 encoded.
    if (encoded.length > 8192) {
      return null;
    }

    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<InvitePayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.ns !== "string" ||
      typeof parsed.inviter !== "string" ||
      !Array.isArray(parsed.relays)
    ) {
      return null;
    }
    return {
      v: 1,
      ns: parsed.ns,
      inviter: parsed.inviter,
      cell: typeof parsed.cell === "string" ? parsed.cell : "",
      relays: parsed.relays.filter((r) => typeof r === "string"),
      ...(typeof parsed.sig === "string" ? { sig: parsed.sig } : {}),
    };
  } catch {
    return null;
  }
}

/** Parse invite from URL hash, pasted link, or raw encoded payload. */
export function parseInviteInput(raw: string): InvitePayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const marker = "#/join?d=";
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    const encoded = trimmed.slice(idx + marker.length).split(/[#&?\s]/)[0] ?? "";
    return decodeInvite(encoded);
  }
  if (trimmed.startsWith(marker)) {
    return decodeInvite(trimmed.slice(marker.length));
  }
  return decodeInvite(trimmed);
}

/** Parse an invite from the current URL hash, if present. */
export function parseInviteFromUrl(): InvitePayload | null {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeInvite(hash.slice(HASH_PREFIX.length));
}

export function clearInviteFromUrl(): void {
  if (window.location.hash.startsWith(HASH_PREFIX)) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}
