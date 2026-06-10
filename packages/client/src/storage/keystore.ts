import type { KeyPair } from "@aethelos/core";
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { ed } from "../crypto-init.js";

const DB_NAME = "aethelos-keystore";
const STORE = "keys";
const PBKDF2_ITERATIONS = import.meta.env["VITE_E2E"] === "1" ? 1_000 : 210_000;

interface StoredIdentity {
  publicKeyHex: string;
  encryptedPrivateKey: string;
  salt: string;
  iv: string;
  displayName: string;
  /** True when the key was derived from a recovery phrase the user has seen. */
  backedUp: boolean;
}

export interface IdentitySummary {
  publicKeyHex: string;
  displayName: string;
  backedUp: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "publicKeyHex" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): Uint8Array {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

/** Recovery phrase -> deterministic Ed25519 private key (32 bytes). */
function privateKeyFromMnemonic(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic, wordlist); // 16 bytes for 12 words
  // Stretch entropy to a 32-byte Ed25519 seed deterministically.
  return sha256(entropy);
}

async function keyPairFromPrivate(privateKey: Uint8Array): Promise<KeyPair> {
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey, publicKeyHex: bytesToHex(publicKey) };
}

async function persist(
  keyPair: KeyPair,
  password: string,
  displayName: string,
  backedUp: boolean,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    keyPair.privateKey as BufferSource,
  );
  const stored: StoredIdentity = {
    publicKeyHex: keyPair.publicKeyHex,
    encryptedPrivateKey: bufToB64(encrypted),
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    displayName,
    backedUp,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Create a brand-new identity backed by a fresh 12-word recovery phrase. */
export async function createIdentity(
  password: string,
  displayName: string,
): Promise<{ keyPair: KeyPair; mnemonic: string }> {
  const mnemonic = generateMnemonic(wordlist, 128);
  const keyPair = await keyPairFromPrivate(privateKeyFromMnemonic(mnemonic));
  await persist(keyPair, password, displayName, false);
  return { keyPair, mnemonic };
}

/** Restore an identity from a recovery phrase on any device. */
export async function restoreFromMnemonic(
  mnemonic: string,
  password: string,
  displayName: string,
): Promise<KeyPair | null> {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, wordlist)) return null;
  const keyPair = await keyPairFromPrivate(privateKeyFromMnemonic(normalized));
  await persist(keyPair, password, displayName, true);
  return keyPair;
}

export function isValidMnemonic(mnemonic: string): boolean {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  return validateMnemonic(normalized, wordlist);
}

export async function markBackedUp(publicKeyHex: string): Promise<void> {
  const db = await openDb();
  const stored = await getStored(db, publicKeyHex);
  if (!stored) return;
  stored.backedUp = true;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getStored(
  db: IDBDatabase,
  publicKeyHex: string,
): Promise<StoredIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(publicKeyHex);
    req.onsuccess = () => resolve(req.result as StoredIdentity | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function unlockIdentity(
  publicKeyHex: string,
  password: string,
): Promise<KeyPair | null> {
  const db = await openDb();
  const stored = await getStored(db, publicKeyHex);
  if (!stored) return null;
  try {
    const salt = b64ToBuf(stored.salt);
    const iv = b64ToBuf(stored.iv);
    const aesKey = await deriveKey(password, salt as BufferSource);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      b64ToBuf(stored.encryptedPrivateKey) as BufferSource,
    );
    return keyPairFromPrivate(new Uint8Array(decrypted));
  } catch {
    return null;
  }
}

export async function listIdentities(): Promise<IdentitySummary[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as StoredIdentity[]).map((s) => ({
          publicKeyHex: s.publicKeyHex,
          displayName: s.displayName,
          backedUp: s.backedUp,
        })),
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getIdentity(publicKeyHex: string): Promise<IdentitySummary | null> {
  const db = await openDb();
  const stored = await getStored(db, publicKeyHex);
  if (!stored) return null;
  return {
    publicKeyHex: stored.publicKeyHex,
    displayName: stored.displayName,
    backedUp: stored.backedUp,
  };
}

/** Encrypted, portable identity export (the raw encrypted record as JSON). */
export async function exportIdentityFile(publicKeyHex: string): Promise<string | null> {
  const db = await openDb();
  const stored = await getStored(db, publicKeyHex);
  if (!stored) return null;
  return JSON.stringify(
    { kind: "aethelos-identity", version: 1, identity: stored },
    null,
    2,
  );
}

export async function importIdentityFile(json: string): Promise<IdentitySummary | null> {
  try {
    const parsed = JSON.parse(json) as {
      kind?: string;
      identity?: StoredIdentity;
    };
    if (parsed.kind !== "aethelos-identity" || !parsed.identity?.publicKeyHex)
      return null;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(parsed.identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return {
      publicKeyHex: parsed.identity.publicKeyHex,
      displayName: parsed.identity.displayName,
      backedUp: parsed.identity.backedUp,
    };
  } catch {
    return null;
  }
}
