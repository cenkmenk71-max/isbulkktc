/**
 * Dedicated DNS-only hostname for authenticated GitHub cron callbacks.
 * Custom domains bypass Vercel deployment SSO, and DNS-only traffic bypasses
 * Cloudflare's proxy protections. The Proxy therefore allows only the two
 * exact cron POST routes below; each handler still requires Bearer auth.
 *
 * This host is not a second public application origin. Consent readiness
 * gates in both handlers remain closed until the database consent controls
 * are deployed and verified.
 */
export const MAIL_INGRESS_HOST = "hooks.isbulkktc.com";

const ALLOWED_MAIL_INGRESS_PATHS = new Set([
  "/api/email/acquisition-campaign",
  "/api/email/engagement-digest",
]);

export function isMailIngressHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/\.$/, "") === MAIL_INGRESS_HOST;
}

export function isAllowedMailIngressRequest(
  method: string,
  pathname: string,
): boolean {
  return method.toUpperCase() === "POST" && ALLOWED_MAIL_INGRESS_PATHS.has(pathname);
}
