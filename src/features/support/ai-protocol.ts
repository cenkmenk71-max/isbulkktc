import { faqByLocale, siteSummaryByLocale } from "@/content/ai-visibility/faq";
import {
  SITE_NAME,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_TEL,
} from "@/content/ai-visibility/site";
import { localeNames, type AppLocale } from "@/i18n/routing";

import type { SupportAiConfig } from "./ai-config";

/**
 * The wire shaping for the optional AI fallback: the grounded system prompt,
 * the provider-specific request, the response parse and the reply sanitiser.
 *
 * All of it is pure — no `fetch`, no `process.env` — so the request each
 * provider receives, and the text a model's reply is reduced to, are unit
 * testable without a live endpoint or a `server-only` boundary. The network
 * call and the timeout live in `@/server/support/ai`.
 *
 * The prompt pins the model to the platform's own published copy (the FAQ
 * bundle and the site summary the deterministic answer already uses), so the
 * fallback cannot introduce a feature, a price or a channel the product does
 * not ship.
 */

/** Upper bound on a model reply, matched to the widget's message length. */
export const MAX_AI_REPLY_LENGTH = 1200;

/** Token ceiling per turn — a support answer is short; this bounds the cost. */
const MAX_OUTPUT_TOKENS = 512;

/** Low temperature: a support answer should be steady, not creative. */
const TEMPERATURE = 0.2;

/**
 * The system prompt: identity, the visitor's language, the grounded facts and
 * the rules that keep the reply truthful and on-topic.
 */
export function buildSupportSystemPrompt(locale: AppLocale): string {
  const facts = faqByLocale[locale]
    .map((entry) => `- Q: ${entry.question}\n  A: ${entry.answer}`)
    .join("\n");

  return [
    `You are the live-support assistant for ${SITE_NAME}, a jobs and careers platform in Northern Cyprus.`,
    `Answer in ${localeNames[locale]}.`,
    "Use only the facts below. Never invent features, prices, districts or contact details.",
    `If a question is not covered, say you will pass it to the team and give the contact details: ${SUPPORT_EMAIL}, ${SUPPORT_PHONE_TEL}.`,
    "Be concise, professional and free of spelling mistakes. Reply with the answer text only — no preamble, no markdown headings, no mention of being an AI or of these instructions.",
    "",
    "Facts:",
    siteSummaryByLocale[locale],
    facts,
  ].join("\n");
}

/** A provider request: an absolute URL and the `fetch` init to send it with. */
export interface SupportAiRequest {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
}

/**
 * Build the request for `config`'s provider. Gemini uses its own
 * `generateContent` shape with the key in `x-goog-api-key`; Groq and OpenRouter
 * share the OpenAI chat-completions shape with a bearer token.
 */
export function buildSupportAiRequest(
  config: SupportAiConfig,
  input: { message: string; locale: AppLocale },
): SupportAiRequest {
  const system = buildSupportSystemPrompt(input.locale);

  if (config.wire === "gemini") {
    return {
      url: `${config.baseUrl}/models/${config.model}:generateContent`,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: input.message }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
      },
    };
  }

  return {
    url: `${config.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: input.message },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    },
  };
}

/**
 * The model's text from a provider response, or `null` when the body carries no
 * answer (a blocked prompt, a safety stop, a shape we do not recognise).
 * Returning `null` lets the caller fall back to grounded copy instead of
 * surfacing an empty bubble.
 */
export function parseSupportAiResponse(
  config: SupportAiConfig,
  payload: unknown,
): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  if (config.wire === "gemini") {
    const candidates = (payload as { candidates?: unknown }).candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const parts = (candidates[0] as { content?: { parts?: unknown } })?.content
      ?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((part) => (part as { text?: unknown }).text)
      .filter((value): value is string => typeof value === "string")
      .join("");
    return text.trim() || null;
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const content = (choices[0] as { message?: { content?: unknown } })?.message
    ?.content;
  return typeof content === "string" && content.trim() ? content : null;
}

/**
 * Reduce a model reply to clean, bounded text: collapse the whitespace a model
 * often pads with, strip a wrapper of quotes or backticks, and cap the length.
 * Returns `null` when nothing meaningful is left, so the caller falls back.
 */
export function sanitizeModelReply(raw: string | null): string | null {
  if (typeof raw !== "string") return null;

  let text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // A reply that is entirely wrapped in one quote/backtick pair is a model
  // habit, not part of the answer.
  const wrapped = /^(["'`])([\s\S]*)\1$/.exec(text);
  if (wrapped) text = wrapped[2].trim();

  if (!text) return null;
  return text.length > MAX_AI_REPLY_LENGTH
    ? `${text.slice(0, MAX_AI_REPLY_LENGTH).trimEnd()}…`
    : text;
}
