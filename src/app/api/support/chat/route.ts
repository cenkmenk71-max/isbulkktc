import { isAppLocale } from "@/i18n/routing";
import { supportChatRateLimiter } from "@/features/abuse/limits";
import { clientIpFromHeaders } from "@/features/abuse/request-context";
import { planSupportReply } from "@/features/support/answer";
import { answerFromKnowledge } from "@/features/support/knowledge";
import { aiSupportReply } from "@/server/support/ai";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;

/**
 * One live-support chat turn.
 *
 * The deterministic knowledge base answers on-topic questions from the
 * platform's own published copy, so the reply is instant, free and cannot
 * hallucinate — it always wins when it matches. A question copy cannot place is
 * optionally handed to a hosted model (`aiSupportReply`), but only when the
 * operator has configured one; that call is server-side and env-gated, so a
 * deployment with no key behaves exactly as before. When neither answers, the
 * grounded fallback copy is used rather than a shrug. The precedence lives in
 * `planSupportReply`, not in this handler.
 *
 * The route is throttled per client address so a scripted caller cannot drive
 * it without bound; the write path (persisting the thread) stays on the frozen
 * `submit_support_message` RPC, which throttles on its own.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  if (!supportChatRateLimiter.check(`ip:${ip}`).ok) {
    return json({ error: "rate_limited" }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { message, locale } = (payload ?? {}) as {
    message?: unknown;
    locale?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    return json({ error: "empty_message" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: "message_too_long" }, 400);
  }

  const resolvedLocale =
    typeof locale === "string" && isAppLocale(locale) ? locale : "tr";
  const trimmed = message.trim();

  // The deterministic answer is computed first and short-circuits the model:
  // a definite platform fact is never handed to (or replaced by) a model.
  const grounded = answerFromKnowledge(trimmed, resolvedLocale);
  const aiReply = grounded ? null : await aiSupportReply(trimmed, resolvedLocale);

  return json(planSupportReply({ grounded, aiReply, locale: resolvedLocale }));
}

/**
 * Every response — success or error — forbids shared caching, so a CDN rule can
 * never pin a stale answer (or a stale rate-limit rejection) to an address.
 */
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
