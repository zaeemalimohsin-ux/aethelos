/**
 * Cloudflare quick tunnel URL validation (mirrors packages/client/src/app/public-share-url.ts).
 */

export function isValidQuickTunnelHost(hostname) {
  const host = hostname.toLowerCase();
  if (!host.endsWith(".trycloudflare.com")) return false;
  const sub = host.slice(0, -".trycloudflare.com".length);
  return Boolean(sub) && sub !== "api" && !sub.includes(".");
}

export function isValidPublicShareUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return isValidQuickTunnelHost(parsed.hostname);
  } catch {
    return false;
  }
}
