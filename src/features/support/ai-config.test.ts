import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SUPPORT_AI_PROVIDER,
  resolveSupportAiConfig,
} from "./ai-config";

/**
 * The AI fallback is opt-in: a deployment with no key must behave exactly as it
 * did before the fallback existed. `resolveSupportAiConfig` is the single gate
 * that decides whether the fallback exists, and it is pure — the environment is
 * passed in — so these cases pin the resolution rules without a live endpoint or
 * a `server-only` boundary.
 */

test("no key means no fallback at all", () => {
  for (const value of [undefined, "", "   "]) {
    assert.equal(
      resolveSupportAiConfig({ SUPPORT_AI_API_KEY: value }),
      null,
      `expected ${JSON.stringify(value)} to disable the fallback`,
    );
  }
});

test("a key alone selects the default provider, model and base URL", () => {
  const config = resolveSupportAiConfig({ SUPPORT_AI_API_KEY: "k" });
  assert.ok(config);
  assert.equal(config.provider, DEFAULT_SUPPORT_AI_PROVIDER);
  assert.equal(config.wire, "gemini");
  assert.equal(config.apiKey, "k");
  assert.match(config.model, /gemini/);
  assert.match(config.baseUrl, /^https:\/\/generativelanguage\.googleapis\.com/);
});

test("the key is trimmed and never re-shaped", () => {
  const config = resolveSupportAiConfig({ SUPPORT_AI_API_KEY: "  secret-key  " });
  assert.equal(config?.apiKey, "secret-key");
});

test("each known provider maps to its own wire protocol and default base", () => {
  const gemini = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "gemini",
  });
  assert.equal(gemini?.wire, "gemini");

  for (const provider of ["groq", "openrouter"]) {
    const config = resolveSupportAiConfig({
      SUPPORT_AI_API_KEY: "k",
      SUPPORT_AI_PROVIDER: provider,
    });
    assert.equal(config?.wire, "openai", `${provider} speaks the OpenAI shape`);
    assert.ok(config?.baseUrl.startsWith("https://"));
  }
});

test("the provider name is case-insensitive", () => {
  const config = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "  GROQ ",
  });
  assert.equal(config?.provider, "groq");
});

test("an unknown provider falls back to the default, not to disabled", () => {
  // A typo must not silently turn the fallback off while a valid key sits unused.
  const config = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "nope",
  });
  assert.equal(config?.provider, DEFAULT_SUPPORT_AI_PROVIDER);
});

test("a model and base URL override the provider defaults", () => {
  const config = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "groq",
    SUPPORT_AI_MODEL: "custom-model",
    SUPPORT_AI_BASE_URL: "https://gateway.internal/v1/",
  });
  assert.equal(config?.model, "custom-model");
  // The trailing slash is dropped so a path can be appended without doubling.
  assert.equal(config?.baseUrl, "https://gateway.internal/v1");
});

test("a blank override is ignored in favour of the default", () => {
  const config = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_MODEL: "   ",
    SUPPORT_AI_BASE_URL: "",
  });
  assert.match(config!.model, /gemini/);
  assert.equal(config!.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
});
