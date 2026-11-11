import { isAppLocale } from "@/i18n/routing";
import { faqByLocale, siteSummaryByLocale } from "@/content/ai-visibility/faq";
import { supportChatRateLimiter } from "@/features/abuse/limits";
import { clientIpFromHeaders } from "@/features/abuse/request-context";
import { answerFromKnowledge, fallbackReply } from "@/features/support/knowledge";
import { isAiConfigured, requestAiReply } from "@/features/support/ai-reply";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;

type ChatReply = {
  reply: string;
  source: "knowledge" | "ai" | "fallback";
};

/**
 * One live-support chat turn.
 *
 * The order is deliberate: the deterministic knowledge base answers on-topic
 * questions from the platform's own published copy first, so the common case is
 * instant, free and cannot hallucinate. Only a question it cannot place reaches
 * the optional AI layer, and only when that is unconfigured or declines does the
 * turn fall back to grounded copy. The visitor therefore always gets a real
 * answer, and adding an API key later changes the middle branch alone.
 *
 * The route is throttled per client address so a scripted caller cannot drive
 * the AI fallback without bound; the write path (persisting the thread) stays on
 * the frozen `submit_support_message` RPC, which throttles on its own.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  if (!supportChatRateLimiter.check(`ip:${ip}`).ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { message, locale } = (payload ?? {}) as {
    message?: unknown;
    locale?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json({ error: "message_too_long" }, { status: 400 });
  }

  const resolvedLocale =
    typeof locale === "string" && isAppLocale(locale) ? locale : "tr";
  const trimmed = message.trim();

  const grounded = answerFromKnowledge(trimmed, resolvedLocale);
  if (grounded) {
    return json({ reply: grounded, source: "knowledge" });
  }

  if (isAiConfigured()) {
    const facts = [
      siteSummaryByLocale[resolvedLocale],
      ...faqByLocale[resolvedLocale].map(
        (entry) => `Q: ${entry.question}\nA: ${entry.answer}`,
      ),
    ].join("\n\n");
    const ai = await requestAiReply(trimmed, resolvedLocale, facts, request.signal);
    if (ai) {
      return json({ reply: ai.text, source: "ai" });
    }
  }

  return json({ reply: fallbackReply(resolvedLocale), source: "fallback" });
}

function json(body: ChatReply): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
