/**
 * RFC 8461 MTA-STS policy.
 *
 * The policy pins the TLS that *senders to this domain* may use, so it is about
 * mail this domain receives — it never changes where outbound mail lands. It is
 * published as a plain-text file at
 * `https://mta-sts.<domain>/.well-known/mta-sts.txt`; the `_mta-sts` TXT record
 * (`v=STSv1; id=…`) is what makes senders look for it. Serving the file is half
 * of the rollout — the two DNS records are the other half (see the deliverability
 * runbook).
 *
 * `mode: testing` is deliberate for a first rollout: a sender that cannot
 * establish the pinned TLS still delivers the message and only reports the
 * failure through TLS-RPT. `enforce` would reject the message, so it is only safe
 * once `testing` reports are clean — the same "observe before you enforce" rule
 * DMARC applies to `p=none` → `p=reject`.
 *
 * Pure (no `server-only`, no env, no I/O) so the body is unit-testable and the
 * route decides where the values come from.
 */

/** 12-digit date stamp `YYYYMMDDHHMMSS` (RFC 8461 §3.2); bump it to roll the policy. */
export const MTA_STS_POLICY_ID = "20261112000000";

/** How long a sender may cache this policy before refetching (RFC 8461 §3.2). */
const MAX_AGE_SECONDS = 604800;

/**
 * Renders the policy body. `mxHosts` must list every host that accepts mail for
 * the domain: a host missing here is not a host an enforcing sender will use.
 * Blank entries are dropped so a stray comma cannot emit an empty `mx:` host.
 */
export function buildMtaStsPolicy(mxHosts: string[]): string {
  const hosts = mxHosts.map((host) => host.trim()).filter(Boolean);
  return [
    "version: STSv1",
    "mode: testing",
    `mx: ${hosts.join(" ")}`,
    `max_age: ${MAX_AGE_SECONDS}`,
  ].join("\n");
}
