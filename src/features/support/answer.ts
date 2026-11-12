import type { AppLocale } from "@/i18n/routing";

import { fallbackReply } from "./knowledge";

/**
 * How one live-support turn was answered.
 *
 * `knowledge` is the published-FAQ match, `ai` is the hosted-model fallback the
 * operator opted into, and `fallback` is the grounded copy used when neither is
 * available. Keeping the choice in one pure function makes the precedence —
 * deterministic first, AI only second, grounded copy last — a testable rule
 * rather than a chain of `if`s buried in the route.
 */
export type SupportReplySource = "knowledge" | "ai" | "fallback";

export interface SupportReply {
  reply: string;
  source: SupportReplySource;
}

/**
 * Pick the reply for a turn from the two candidate answers.
 *
 * The knowledge answer always wins when present, so a definite platform fact is
 * never replaced by a model's paraphrase; the AI answer is used only when the
 * knowledge base had nothing, and the grounded fallback covers every other case
 * (no AI configured, or the model was unreachable).
 */
export function planSupportReply(input: {
  grounded: string | null;
  aiReply: string | null;
  locale: AppLocale;
}): SupportReply {
  if (input.grounded) return { reply: input.grounded, source: "knowledge" };
  if (input.aiReply) return { reply: input.aiReply, source: "ai" };
  return { reply: fallbackReply(input.locale), source: "fallback" };
}
