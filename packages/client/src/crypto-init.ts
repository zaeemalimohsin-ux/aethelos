import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...messages: Uint8Array[]) =>
  sha512(ed.etc.concatBytes(...messages));
ed.etc.sha512Async = (...messages: Uint8Array[]) =>
  Promise.resolve(sha512(ed.etc.concatBytes(...messages)));

export { ed };
