/**
 * Fixed-window rate limiter for the anonymous, mail-sending server actions.
 *
 * `submitFeedback` and `submitSalesLead` need no session and each fan out to
 * outbound email, so a scripted caller can use them to mail an arbitrary address
 * and flood the team inbox. Turnstile cannot protect these paths: Supabase
 * verifies a captcha token on its own auth endpoints only, never on an arbitrary
 * RPC. A server-side throttle needs no client round trip and no secret, so it
 * cannot be switched off by a misconfiguration.
 *
 * State is per process and in memory, so it is best-effort: a serverless
 * deployment runs several instances and the effective limit becomes
 * `limit × instances`. That still bounds an unbounded mail loop. An exact shared
 * counter needs a store the repository does not have (Redis/Upstash).
 */

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

export type RateLimiter = {
  /** Records an attempt for `key` and reports whether it is within budget. */
  check(key: string): RateLimitResult;
  /** Drops every bucket. Lets a test reset a shared limiter. */
  clear(): void;
};

type Bucket = { count: number; resetAt: number };

/**
 * Upper bound on tracked keys, so a flood of spoofed addresses cannot grow the
 * map without limit. Older buckets are dropped first; the newest key is always
 * kept, so the limiter keeps working under load instead of failing open.
 */
export const MAX_TRACKED_KEYS = 5000;

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** Injectable clock so tests need not sleep. */
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function makeRoom(current: number): void {
    if (buckets.size < MAX_TRACKED_KEYS) return;

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }

    // Still full of live buckets. Evicting the oldest insertion (Map preserves
    // insertion order) is preferred over rejecting new callers: refusing to
    // track a new address would let a flood lock legitimate visitors out.
    while (buckets.size >= MAX_TRACKED_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return {
    check(key) {
      const current = now();
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= current) {
        makeRoom(current);
        buckets.set(key, { count: 1, resetAt: current + windowMs });
        return { ok: true };
      }

      if (bucket.count >= limit) {
        return { ok: false, retryAfterMs: bucket.resetAt - current };
      }

      bucket.count += 1;
      return { ok: true };
    },

    clear() {
      buckets.clear();
    },
  };
}
