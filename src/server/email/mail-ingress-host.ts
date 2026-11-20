/**
 * Dedicated DNS-only hostname for authenticated GitHub cron callbacks. The Vercel project uses SSO protection for deployment URLs, while
 * Cloudflare Bot Fight Mode can challenge server-to-server cron requests.
 *
 * This host is intentionally not a second public application origin: the
 * Next.js Proxy permits only the exact POST routes below. Each route still
 * enforces its own Bearer authentication.
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
