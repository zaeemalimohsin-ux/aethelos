import { describe, it, expect } from "vitest";
import {
  isValidPublicShareUrl,
  isValidQuickTunnelHost,
} from "../src/app/public-share-url.js";

describe("public share URL validation", () => {
  it("accepts quick tunnel hostnames", () => {
    expect(isValidPublicShareUrl("https://abc.trycloudflare.com")).toBe(true);
    expect(isValidPublicShareUrl("https://abc.trycloudflare.com/")).toBe(true);
  });

  it("rejects api.trycloudflare.com", () => {
    expect(isValidQuickTunnelHost("api.trycloudflare.com")).toBe(false);
    expect(isValidPublicShareUrl("https://api.trycloudflare.com/tunnel")).toBe(false);
  });

  it("rejects dotted subdomains and localhost", () => {
    expect(isValidQuickTunnelHost("foo.bar.trycloudflare.com")).toBe(false);
    expect(isValidPublicShareUrl("http://localhost:5173")).toBe(false);
    expect(isValidPublicShareUrl("https://127.0.0.1")).toBe(false);
  });
});
