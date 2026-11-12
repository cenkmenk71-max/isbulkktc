/**
 * Provider-independent configuration for the optional live-support AI fallback.
 *
 * The chat answers definite platform questions from the published FAQ copy
 * first, in-process. Only a question that copy cannot place may be handed to a
 * hosted model, and only when the operator has configured one — so this module
 * is the single place that decides whether that fallback exists at all.
 *
 * It is deliberately pure: the environment values are passed in, never read
 * from `process.env` here, so the resolution rules are unit-testable without a
 * `server-only` boundary and the same rules can be reused by any caller.
 *
 * Four variables drive it:
 *
 *   SUPPORT_AI_PROVIDER  `gemini` (default), `groq` or `openrouter`
 *   SUPPORT_AI_API_KEY   the provider key; **absent means no fallback at all**
 *   SUPPORT_AI_MODEL     overrides the provider's default model
 *   SUPPORT_AI_BASE_URL  overrides the provider's API base (self-hosted gateways)
 *
 * An unknown provider name falls back to the default rather than disabling the
 * feature: a typo in `SUPPORT_AI_PROVIDER` should not silently turn the fallback
 * off while a valid key sits unused.
 */

export const SUPPORT_AI_PROVIDERS = ["gemini", "groq", "openrouter"] as const;

export type SupportAiProvider = (typeof SUPPORT_AI_PROVIDERS)[number];

/**
 * The provider each name maps to when it is unrecognised or unset. Gemini is
 * the default because its free tier is the most generous of the three and its
 * Flash-Lite models answer a support question well within the quota.
 */
export const DEFAULT_SUPPORT_AI_PROVIDER: SupportAiProvider = "gemini";

/** Default model per provider, all on the provider's free/cheap tier. */
const DEFAULT_MODEL: Record<SupportAiProvider, string> = {
  gemini: "gemini-2.5-flash-lite",
  groq: "openai/gpt-oss-20b",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
};

/**
 * Official API base per provider. `gemini` speaks its own `generateContent`
 * protocol; `groq` and `openrouter` both speak the OpenAI chat-completions
 * shape, so they share a request builder.
 */
const DEFAULT_BASE_URL: Record<SupportAiProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/** Which wire protocol a provider's base URL speaks. */
export type SupportAiWire = "gemini" | "openai";

export interface SupportAiConfig {
  provider: SupportAiProvider;
  wire: SupportAiWire;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface SupportAiEnv {
  SUPPORT_AI_PROVIDER?: string;
  SUPPORT_AI_API_KEY?: string;
  SUPPORT_AI_MODEL?: string;
  SUPPORT_AI_BASE_URL?: string;
}

function normalizeProvider(value: string | undefined): SupportAiProvider {
  const name = value?.trim().toLowerCase();
  return (SUPPORT_AI_PROVIDERS as readonly string[]).includes(name ?? "")
    ? (name as SupportAiProvider)
    : DEFAULT_SUPPORT_AI_PROVIDER;
}

/** Trailing slashes are dropped so a path can be appended without doubling. */
function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Resolve the AI fallback configuration, or `null` when it is not usable.
 *
 * `null` — not an error — is the "no fallback" signal: the route treats it as
 * "answer deterministically", so a deployment with no key configured behaves
 * exactly as it did before the fallback existed.
 */
export function resolveSupportAiConfig(
  env: SupportAiEnv,
): SupportAiConfig | null {
  const apiKey = env.SUPPORT_AI_API_KEY?.trim();
  if (!apiKey) return null;

  const provider = normalizeProvider(env.SUPPORT_AI_PROVIDER);
  const model = env.SUPPORT_AI_MODEL?.trim() || DEFAULT_MODEL[provider];
  const baseUrl = trimBaseUrl(
    env.SUPPORT_AI_BASE_URL?.trim() || DEFAULT_BASE_URL[provider],
  );

  return {
    provider,
    wire: provider === "gemini" ? "gemini" : "openai",
    apiKey,
    model,
    baseUrl,
  };
}
