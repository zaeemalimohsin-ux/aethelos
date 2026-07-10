import { describe, it, expect } from "vitest";
import {
  createIdentity,
  unlockIdentity,
  restoreFromMnemonic,
  exportIdentityFile,
} from "../src/storage/keystore.js";

describe("keystore security", () => {
  it("restoreFromMnemonic yields same public key with different passphrase", async () => {
    const id = await createIdentity("pass-a", "Alice");
    const restored = await restoreFromMnemonic(id.mnemonic, "pass-b", "Alice");
    expect(restored?.publicKeyHex).toBe(id.keyPair.publicKeyHex);
  });

  it("unlockIdentity returns null for wrong password", async () => {
    const id = await createIdentity("correct", "Bob");
    const unlocked = await unlockIdentity(id.keyPair.publicKeyHex, "wrong");
    expect(unlocked).toBeNull();
  });

  it("exported identity file has no plaintext private key field", async () => {
    const id = await createIdentity("secret", "Carol");
    const file = await exportIdentityFile(id.keyPair.publicKeyHex);
    expect(file).toBeTruthy();
    const json = JSON.parse(file!) as {
      kind: string;
      identity: {
        encryptedPrivateKey: string;
        salt: string;
        iv: string;
        privateKey?: string;
      };
    };
    expect(json.kind).toBe("aethelos-identity");
    expect(json.identity.privateKey).toBeUndefined();
    expect(json.identity.encryptedPrivateKey).toBeTruthy();
    expect(json.identity.salt).toBeTruthy();
    expect(json.identity.iv).toBeTruthy();
  });
});
