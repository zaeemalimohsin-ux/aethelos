import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { PublicKeyHex } from "../schema/primitives.js";

ed.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...messages));
ed.etc.sha512Async = (...messages: Uint8Array[]) =>
  Promise.resolve(sha512(ed.etc.concatBytes(...messages)));

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyHex: PublicKeyHex;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return {
    privateKey,
    publicKey,
    publicKeyHex: bytesToHex(publicKey),
  };
}

export function publicKeyFromHex(hex: PublicKeyHex): Uint8Array {
  return hexToBytes(hex);
}

export async function signMessage(
  privateKey: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

export async function verifySignature(
  publicKeyHex: PublicKeyHex,
  message: Uint8Array,
  signatureHex: string,
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const signature = hexToBytes(signatureHex);
    return ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function verifySignatureSync(
  publicKeyHex: PublicKeyHex,
  message: Uint8Array,
  signatureHex: string,
): boolean {
  try {
    const publicKey = hexToBytes(publicKeyHex);
    const signature = hexToBytes(signatureHex);
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function hashBytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

export function hashHex(data: Uint8Array): string {
  return bytesToHex(hashBytes(data));
}

export function hashString(text: string): string {
  return hashHex(utf8ToBytes(text));
}

/** Deterministic JSON: sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys
    .map((k) => {
      const v = obj[k];
      if (v === undefined) return null;
      return `${JSON.stringify(k)}:${canonicalJson(v)}`;
    })
    .filter((p): p is string => p !== null);
  return `{${pairs.join(",")}}`;
}

export function bytesToHexString(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

export function hexToBytesString(hex: string): Uint8Array {
  return hexToBytes(hex);
}
