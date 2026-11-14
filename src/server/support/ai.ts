import "server-only";

import type { AppLocale } from "@/i18n/routing";

import { resolveSupportAiConfig } from "@/features/support/ai-config";
import {
  buildSupportAiRequest,
  guardSupportReply,
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
 * The key is read here and sent only to the configured provider; it is never
 * logged, never returned and never reaches the client. Nothing about this call
 * needs a Content-Security-Policy change, because it runs on the server.
 */

/** A turn must not outlive the visitor's patience; the knowledge path is instant. */
const REQUEST_TIMEOUT_MS = 8000;

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

  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Status only: the response body can echo the request, and the key lives
      // in the request headers.
      console.error("support ai fallback returned a non-ok status", {
        status: response.status,
        provider: config.provider,
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
    // the visitor: answer from the grounded copy.
    console.error("support ai fallback request failed", {
      provider: config.provider,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
