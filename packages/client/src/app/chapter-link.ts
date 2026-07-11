/**
 * Signed chapter links — same trust model as member invites, for federation seams.
 */
import {
  canonicalJson,
  signMessage,
  verifySignatureSync,
  type KeyPair,
} from "@aethelos/core";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { isValidPublicKeyHex } from "./format.js";

export interface ChildChapterLinkPayload {
  v: 1;
  kind: "child_attach";
  childNs: string;
  childCell: string;
  bridge: string;
  relays: string[];
  signer: string;
  sig?: string;
}

export interface ParentChapterLinkPayload {
  v: 1;
  kind: "parent_join";
  parentNs: string;
  parentCell: string;
  relays: string[];
  signer: string;
  sig?: string;
}

export type ChapterLinkPayload = ChildChapterLinkPayload | ParentChapterLinkPayload;

const HASH_PREFIX = "#/chapter?d=";

function toBase64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isValidNamespaceId(id: string): boolean {
  const trimmed = id.trim();
  return trimmed.length >= 8 && trimmed.length <= 128;
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return decodeURIComponent(escape(atob(b64)));
}

export function chapterLinkCanonicalBody(
  payload: ChildChapterLinkPayload | ParentChapterLinkPayload,
): string {
  if (payload.kind === "child_attach") {
    return canonicalJson({
      v: payload.v,
      kind: payload.kind,
      childNs: payload.childNs,
      childCell: payload.childCell,
      bridge: payload.bridge,
      relays: [...payload.relays].sort(),
      signer: payload.signer,
    });
  }
  return canonicalJson({
    v: payload.v,
    kind: payload.kind,
    parentNs: payload.parentNs,
    parentCell: payload.parentCell,
    relays: [...payload.relays].sort(),
    signer: payload.signer,
  });
}

async function signChapterLink<T extends ChildChapterLinkPayload | ParentChapterLinkPayload>(
  payload: T,
  keyPair: KeyPair,
): Promise<T & { sig: string }> {
  if (payload.signer !== keyPair.publicKeyHex) {
    throw new Error("signer_mismatch");
  }
  const body = chapterLinkCanonicalBody(payload);
  const sigBytes = await signMessage(keyPair.privateKey, utf8ToBytes(body));
  return { ...payload, sig: bytesToHex(sigBytes) };
}

export async function signChildChapterAttach(
  payload: Omit<ChildChapterLinkPayload, "sig" | "v" | "kind" | "signer">,
  keyPair: KeyPair,
): Promise<ChildChapterLinkPayload> {
  return signChapterLink(
    { v: 1, kind: "child_attach", ...payload, signer: keyPair.publicKeyHex },
    keyPair,
  );
}

export async function signParentChapterJoin(
  payload: Omit<ParentChapterLinkPayload, "sig" | "v" | "kind" | "signer">,
  keyPair: KeyPair,
): Promise<ParentChapterLinkPayload> {
  return signChapterLink(
    { v: 1, kind: "parent_join", ...payload, signer: keyPair.publicKeyHex },
    keyPair,
  );
}

export function verifyChapterLinkSignature(payload: ChapterLinkPayload): boolean {
  if (!payload.sig) return false;
  if (!isValidPublicKeyHex(payload.signer)) return false;
  if (payload.kind === "child_attach") {
    if (!isValidPublicKeyHex(payload.bridge)) return false;
    if (!isValidNamespaceId(payload.childNs)) return false;
    if (payload.signer !== payload.bridge) return false;
  } else if (!isValidNamespaceId(payload.parentNs)) {
    return false;
  }
  const { sig: _sig, ...rest } = payload;
  const message = utf8ToBytes(chapterLinkCanonicalBody(rest));
  return verifySignatureSync(payload.signer, message, payload.sig);
}

export function encodeChapterLink(payload: ChapterLinkPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeChapterLink(encoded: string): ChapterLinkPayload | null {
  try {
    if (encoded.length > 8192) return null;
    const parsed = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>;
    if (
      parsed["v"] !== 1 ||
      (parsed["kind"] !== "child_attach" && parsed["kind"] !== "parent_join")
    ) {
      return null;
    }
    if (typeof parsed["signer"] !== "string" || !Array.isArray(parsed["relays"])) {
      return null;
    }
    const relays = (parsed["relays"] as unknown[]).filter(
      (r) => typeof r === "string",
    ) as string[];
    if (parsed["kind"] === "child_attach") {
      if (
        typeof parsed["childNs"] !== "string" ||
        typeof parsed["childCell"] !== "string" ||
        typeof parsed["bridge"] !== "string"
      ) {
        return null;
      }
      return {
        v: 1,
        kind: "child_attach",
        childNs: parsed["childNs"] as string,
        childCell: parsed["childCell"] as string,
        bridge: parsed["bridge"] as string,
        relays,
        signer: parsed["signer"] as string,
        ...(typeof parsed["sig"] === "string" ? { sig: parsed["sig"] as string } : {}),
      };
    }
    if (
      typeof parsed["parentNs"] !== "string" ||
      typeof parsed["parentCell"] !== "string"
    ) {
      return null;
    }
    return {
      v: 1,
      kind: "parent_join",
      parentNs: parsed["parentNs"] as string,
      parentCell: parsed["parentCell"] as string,
      relays,
      signer: parsed["signer"] as string,
      ...(typeof parsed["sig"] === "string" ? { sig: parsed["sig"] as string } : {}),
    };
  } catch {
    return null;
  }
}

export function parseChapterLinkInput(raw: string): ChapterLinkPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(HASH_PREFIX);
  if (idx >= 0) {
    const encoded = trimmed.slice(idx + HASH_PREFIX.length).split(/[#&?\s]/)[0] ?? "";
    return decodeChapterLink(encoded);
  }
  if (trimmed.startsWith(HASH_PREFIX)) {
    return decodeChapterLink(trimmed.slice(HASH_PREFIX.length));
  }
  return decodeChapterLink(trimmed);
}

export function buildChapterLinkUrl(payload: ChapterLinkPayload, base?: string): string {
  const origin =
    base?.replace(/\/$/, "") ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const path =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/";
  return `${origin}${path}${HASH_PREFIX}${encodeChapterLink(payload)}`;
}