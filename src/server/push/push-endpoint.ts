/**
 * Web Push endpoint validation.
 *
 * A push subscription's `endpoint` is attacker-controlled: any signed-in visitor
 * can POST an arbitrary `https://` URL to the registration route, and the cron
 * worker later connects to it from inside the deployment. Without a host check
 * that is a blind SSRF — the worker will open a TLS connection to `127.0.0.1`,
 * an RFC1918 address, or a cloud metadata endpoint (169.254.169.254) and only
 * the response is uninteresting (#262).
 *
 * Legitimate endpoints are only ever issued by the browser's own push service,
 * so a small allowlist of those services both closes the SSRF and cannot be
 * widened by an attacker. The allowlist is the primary control: an IP literal,
 * a decimal-encoded address, `localhost`, or any internal name fails to match a
 * push-service host and is rejected. The explicit private-host check below is
 * defence in depth and documents the intent.
 *
 * Pure (no `server-only`, no env) so the rule is unit-testable without the
 * `react-server` condition — the same reason `src/server/config/resend-key.ts`
 * is kept pure.
 */

/** Push services that issue endpoints, by exact host. */
const allowedPushHosts = new Set([
  // Chrome / Edge / Brave / Opera (FCM), and the legacy GCM host.
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Chromium's staging FCM host (`kPushMessagingStagingGcmEndpoint`,
  // components/push_messaging/push_messaging_constants.cc). Every non-stable
  // channel — Beta/Dev/Canary, unbranded Chromium, Android WebView — is issued
  // an endpoint here, so real devices subscribe on it (#500).
  "jmt17.google.com",
  // Firefox (autopush).
  "updates.push.services.mozilla.com",
  // Safari on macOS and iOS 16.4+.
  "web.push.apple.com",
]);

/**
 * Push services whose endpoints live on a per-region subdomain. Windows
 * Notification Service and Apple's regional push hosts are the two that do.
 */
const allowedPushHostSuffixes = [
  ".notify.windows.com",
  ".push.apple.com",
  ".push.services.mozilla.com",
];

const ipv4Literal = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** All digits and dots — catches decimal-encoded IPv4 (`2130706433`). */
const allNumericHost = /^[0-9.]+$/;
const localHostNames = new Set(["localhost", "localhost.localdomain"]);
const localHostSuffixes = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateOrLocalHost(host: string): boolean {
  // `new URL` keeps IPv6 literals bracketed (`[::1]`).
  if (host.startsWith("[")) return true;
  if (ipv4Literal.test(host) || allNumericHost.test(host)) return true;
  if (localHostNames.has(host)) return true;
  return localHostSuffixes.some((suffix) => host.endsWith(suffix));
}

/**
 * Whether a subscription endpoint may be stored and later sent to. Accepts only
 * `https://` endpoints on a known push-service host.
 */
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string") return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  // Credentials in the authority are never used by a push service.
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (isPrivateOrLocalHost(host)) return false;

  if (allowedPushHosts.has(host)) return true;
  return allowedPushHostSuffixes.some((suffix) => host.endsWith(suffix));
}
