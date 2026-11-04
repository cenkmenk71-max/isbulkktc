import { headers } from "next/headers";

/**
 * Best-effort client address for rate limiting.
 *
 * The platform sits behind Cloudflare and Vercel, which set these headers. They
 * are ordered by trustworthiness: `cf-connecting-ip` and `x-real-ip` are written
 * by the edge, while `x-forwarded-for` can be appended to by intermediaries, so
 * only its first (leftmost) entry is the original client. A caller that reaches
 * the origin directly could forge these — the throttle is an abuse control, not
 * an authentication boundary, and the value is never trusted for anything else.
 */
const clientIpHeaders = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;

/** Pure so the header precedence is unit-testable without a request. */
export function clientIpFromHeaders(
  get: (name: string) => string | null,
): string {
  for (const name of clientIpHeaders) {
    const raw = get(name);
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  // No usable address: bucket everyone together. Coarser, but still bounded.
  return "unknown";
}

export async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  return clientIpFromHeaders((name) => requestHeaders.get(name));
}
