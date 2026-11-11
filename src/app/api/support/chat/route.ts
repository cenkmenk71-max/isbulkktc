import { isAppLocale } from "@/i18n/routing";
import { supportChatRateLimiter } from "@/features/abuse/limits";
import { clientIpFromHeaders } from "@/features/abuse/request-context";
import { answerFromKnowledge, fallbackReply } from "@/features/support/knowledge";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;

type ChatReply = {
  reply: string;
  source: "knowledge" | "fallback";
};

/**
 * One live-support chat turn.
 *
 * The deterministic knowledge base answers on-topic questions from the
 * platform's own published copy, so the reply is instant, free and cannot
 * hallucinate. A question it cannot place falls back to grounded copy rather
 * than a shrug. The bot runs entirely in-process: no visitor message ever
 * leaves the deployment to a third party.
 *
 * The route is throttled per client address so a scripted caller cannot drive
 * it without bound; the write path (persisting the thread) stays on the frozen
 * `submit_support_message` RPC, which throttles on its own.
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

  return json({ reply: fallbackReply(resolvedLocale), source: "fallback" });
}

function json(body: ChatReply): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
