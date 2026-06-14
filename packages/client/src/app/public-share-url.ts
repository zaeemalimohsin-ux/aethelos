/**
 * Validation for Cloudflare quick tunnel public share URLs.
 * Keep in sync with scripts/public-share-url.mjs (used by proof scripts).
 */

export function isValidQuickTunnelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host.endsWith(".trycloudflare.com")) return false;
  const sub = host.slice(0, -".trycloudflare.com".length);
  return Boolean(sub) && sub !== "api" && !sub.includes(".");
}

export function isValidPublicShareUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return isValidQuickTunnelHost(parsed.hostname);
  } catch {
    return false;
  }
}
