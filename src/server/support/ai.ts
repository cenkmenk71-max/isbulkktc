import "server-only";

import type { AppLocale } from "@/i18n/routing";

import { resolveSupportAiConfig } from "@/features/support/ai-config";
import {
  buildSupportAiRequest,
  guardSupportReply,
  parseRetryAfterMs,
  parseSupportAiResponse,
  sanitizeModelReply,
} from "@/features/support/ai-protocol";

/**
 * The optional hosted-model fallback for the live-support chat, server-side only.
 *
 * The deterministic knowledge base answers first; this is reached only for a
 * question that copy cannot place, and only when the operator has configured a
 * provider. Every failure mode — no key, a network error, a timeout, a
 * non-2xx, a body with no answer — resolves to `null`, which the caller turns
 * into the grounded fallback. The function therefore never throws and never
 * blocks a reply: a misconfigured or unreachable model degrades to exactly the
 * pre-AI behaviour.
 *
 * A turn is retried a bounded number of times when the provider is briefly
 * overloaded (a 429 or a 5xx) rather than giving up on the first one. On a
 * shared free tier the token bucket empties under even light concurrent use —
 * the grounded prompt is ~1.1k tokens against a few-thousand-per-minute budget —
 * so a single busy moment used to drop the turn to the generic reply for no
 * reason the visitor could see. The retry waits as long as the provider asks
 * (`Retry-After`, `x-ratelimit-reset-tokens`), within a wall-clock budget, so a
 * short burst recovers instead of flaking.
 *
 * The key is read here and sent only to the configured provider; it is never
 * logged, never returned and never reaches the client. Nothing about this call
 * needs a Content-Security-Policy change, because it runs on the server.
 */

/** A single attempt must not outlive the visitor's patience; the knowledge path is instant. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The whole turn, retries included, is capped so a provider that keeps asking us
 * to wait cannot hold the visitor longer than a few seconds beyond the instant
 * knowledge path. Once the budget is spent, the caller falls back to grounded
 * copy rather than waiting further.
 */
const TOTAL_BUDGET_MS = 12000;

/** One initial attempt plus two retries: enough to ride out a short 429 window. */
const MAX_ATTEMPTS = 3;

/**
 * A provider's requested wait is honoured but clamped: `x-ratelimit-reset-tokens`
 * on a busy free tier can name tens of seconds, and waiting that long for one
 * support turn is worse than answering from grounded copy.
 */
const MAX_RETRY_DELAY_MS = 3000;

/** Fallback backoff when the provider named no delay, growing per attempt. */
const BASE_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A 429 or a 5xx is a transient overload; any other 4xx is not worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * The delay before the next attempt: the provider's own request when it named
 * one, else an exponential fallback, both clamped to the per-wait ceiling and to
 * whatever remains of the turn budget.
 */
function nextDelayMs(
  requested: number | null,
  attempt: number,
  elapsed: number,
): number {
  const wanted = requested ?? BASE_RETRY_DELAY_MS * attempt;
  return Math.max(0, Math.min(wanted, MAX_RETRY_DELAY_MS, TOTAL_BUDGET_MS - elapsed));
}

export async function aiSupportReply(
  message: string,
  locale: AppLocale,
): Promise<string | null> {
  const config = resolveSupportAiConfig({
    SUPPORT_AI_PROVIDER: process.env.SUPPORT_AI_PROVIDER,
    SUPPORT_AI_API_KEY: process.env.SUPPORT_AI_API_KEY,
    SUPPORT_AI_MODEL: process.env.SUPPORT_AI_MODEL,
    SUPPORT_AI_BASE_URL: process.env.SUPPORT_AI_BASE_URL,
  });
  if (!config) return null;

  const { url, init } = buildSupportAiRequest(config, { message, locale });
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const lastAttempt = attempt === MAX_ATTEMPTS;
    // The attempt's own timeout is capped by what is left of the turn, so a
    // provider that stalls cannot push the turn past the documented budget.
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 0) return null;
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });

      if (!response.ok) {
        // Status only: the response body can echo the request, and the key lives
        // in the request headers.
        const elapsed = Date.now() - startedAt;
        if (
          isRetryableStatus(response.status) &&
          !lastAttempt &&
          elapsed < TOTAL_BUDGET_MS
        ) {
          const delay = nextDelayMs(
            parseRetryAfterMs(response.headers),
            attempt,
            elapsed,
          );
          console.error("support ai fallback retrying after a transient status", {
            status: response.status,
            provider: config.provider,
            attempt,
            delayMs: delay,
          });
          if (delay > 0) await sleep(delay);
          continue;
        }
        console.error("support ai fallback returned a non-ok status", {
          status: response.status,
          provider: config.provider,
          attempt,
        });
        return null;
      }

      const payload: unknown = await response.json();
      // Two layers: the sanitiser reduces the text, then the guard drops a reply
      // that reproduces the system prompt, so a successful extraction attempt
      // degrades to the grounded fallback instead of reaching the visitor.
      const reply = sanitizeModelReply(parseSupportAiResponse(config, payload));
      return guardSupportReply(reply);
    } catch (error) {
      // A timeout, a DNS failure or a malformed body all mean the same thing to
      // the visitor: answer from the grounded copy. A transient network error is
      // retried like a 5xx, within the same budget.
      const elapsed = Date.now() - startedAt;
      if (!lastAttempt && elapsed < TOTAL_BUDGET_MS) {
        const delay = nextDelayMs(null, attempt, elapsed);
        console.error("support ai fallback retrying after a request failure", {
          provider: config.provider,
          reason: error instanceof Error ? error.name : "unknown",
          attempt,
          delayMs: delay,
        });
        if (delay > 0) await sleep(delay);
        continue;
      }
      console.error("support ai fallback request failed", {
        provider: config.provider,
        reason: error instanceof Error ? error.name : "unknown",
        attempt,
      });
      return null;
    }
  }

  return null;
}
