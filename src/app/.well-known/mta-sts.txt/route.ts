import { buildMtaStsPolicy } from "@/server/email/mta-sts-policy";

export const dynamic = "force-static";

/**
 * RFC 8461 MTA-STS policy, served at
 * `https://mta-sts.isbulkktc.com/.well-known/mta-sts.txt`. Static: the body only
 * changes when the MX host or the policy id does, and a sender must be able to
 * fetch it without a redirect or a cache-busting query.
 *
 * The host list is the domain's real inbound MX — Cloudflare Email Routing, which
 * fronts the Resend Forge receiver. Keep it in step with the live `MX` record:
 * a host left out of the policy is one an enforcing sender will not deliver to.
 */
const MX_HOST = process.env.MTA_STS_MX_HOST || "receive-euw1.forge.rmta.net";

export function GET() {
  return new Response(`${buildMtaStsPolicy([MX_HOST])}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
