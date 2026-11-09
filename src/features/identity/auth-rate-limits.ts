import { createRateLimiter } from "@/features/abuse/rate-limit";

/**
 * Application-level abuse controls for the credential endpoints (#418 §7).
 *
 * `signIn` and `requestPasswordReset` are the two endpoints #418 names under
 * "Rate limit: giriş denemesi, şifre sıfırlama talebi". Neither carried a bound:
 * a publishable key is enough to POST `/auth/v1/token?grant_type=password` and
 * `/auth/v1/recover` directly, and the hosted project does not enforce its
 * captcha, so an unlimited password guess and an unlimited reset-mail fan-out
 * both lived one HTTP call away. This limiter runs in the server action, above
 * Supabase, so the app path is bounded the same way the feedback/sales forms
 * already are (`src/features/abuse/limits.ts`).
 *
 * The window and the budgets mirror that module's reasoning: ten minutes is
 * short enough to bound a flood and long enough that a visitor whose first
 * attempt failed is not locked out. Each action is keyed on both the client
 * address and the submitted address, so neither one origin nor one victim
 * mailbox can be driven without limit.
 *
 * The address budget is deliberately looser than the per-account budget: a
 * shared/NAT egress (an office, a mobile carrier, the CI runner) puts many
 * legitimate visitors behind one address, and locking them out to stop a spray
 * would trade a brute-force risk for a denial of service. The per-account
 * budget is the tight one, because that is the guess rate a single account
 * actually sees. As in `src/features/abuse/rate-limit.ts` the state is per
 * process and best-effort — the effective limit is `limit × instances` — which
 * still bounds an unbounded loop.
 */
const windowMs = 10 * 60 * 1000;

export const signInThrottle = {
  /** Per client address. Loose enough for a shared egress; caps one origin. */
  address: createRateLimiter({ limit: 30, windowMs }),
  /** Per submitted address. The brute-force budget for one account. */
  email: createRateLimiter({ limit: 10, windowMs }),
};

export const passwordResetThrottle = {
  /** Per client address. Caps a reset-mail fan-out from one origin. */
  address: createRateLimiter({ limit: 10, windowMs }),
  /** Per submitted address. Keeps one victim mailbox from being flooded. */
  email: createRateLimiter({ limit: 5, windowMs }),
};
