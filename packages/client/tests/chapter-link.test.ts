import { describe, it, expect } from "vitest";
import { generateKeyPair } from "@aethelos/core";
import {
  chapterLinkCanonicalBody,
  signChildChapterAttach,
  signParentChapterJoin,
  verifyChapterLinkSignature,
  decodeChapterLink,
  encodeChapterLink,
  buildChapterLinkUrl,
  parseChapterLinkInput,
} from "../src/app/chapter-link.js";

describe("chapter link signatures", () => {
  it("validates child_attach signed by bridge head", async () => {
    const kp = await generateKeyPair();
    const payload = await signChildChapterAttach(
      {
        childNs: "child-namespace-abc12345",
        childCell: "Child Cell",
        bridge: kp.publicKeyHex,
        relays: ["ws://localhost:8787"],
      },
      kp,
    );
    expect(verifyChapterLinkSignature(payload)).toBe(true);
  });

  it("rejects tampered child namespace", async () => {
    const kp = await generateKeyPair();
    const payload = await signChildChapterAttach(
      {
        childNs: "child-namespace-abc12345",
        childCell: "Child Cell",
        bridge: kp.publicKeyHex,
        relays: ["ws://localhost:8787"],
      },
      kp,
    );
    const tampered = { ...payload, childNs: "evil-namespace-abc12345" };
    expect(verifyChapterLinkSignature(tampered)).toBe(false);
  });

  it("validates parent_join signed by parent head", async () => {
    const kp = await generateKeyPair();
    const payload = await signParentChapterJoin(
      {
        parentNs: "parent-namespace-xyz98765",
        parentCell: "Parent Cell",
        relays: ["ws://a", "ws://b"],
      },
      kp,
    );
    expect(verifyChapterLinkSignature(payload)).toBe(true);
  });

  it("round-trips encode/decode and URL parse", async () => {
    const kp = await generateKeyPair();
    const payload = await signChildChapterAttach(
      {
        childNs: "roundtrip-ns-12345678",
        childCell: "Round",
        bridge: kp.publicKeyHex,
        relays: ["ws://relay"],
      },
      kp,
    );
    const encoded = encodeChapterLink(payload);
    const decoded = decodeChapterLink(encoded);
    expect(decoded?.childNs).toBe("roundtrip-ns-12345678");
    expect(decoded?.sig).toBe(payload.sig);
    expect(chapterLinkCanonicalBody(decoded!)).toBe(
      chapterLinkCanonicalBody({ ...payload, sig: undefined }),
    );
    const url = buildChapterLinkUrl(payload, "http://localhost:5173");
    expect(parseChapterLinkInput(url)?.childNs).toBe("roundtrip-ns-12345678");
  });

  it("rejects excessively large payloads", () => {
    expect(decodeChapterLink("A".repeat(10000))).toBeNull();
  });
});
