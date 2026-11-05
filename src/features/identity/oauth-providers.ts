import { oauthProviderSchema, type OAuthProvider } from "./schemas";

/**
 * Brand names for the OAuth providers GoTrue reports in
 * `app_metadata.providers`. Proper nouns, so they are identical in every
 * locale; the non-brand methods (`email`, `phone`) go through the message
 * catalog instead, which is why this map does not cover them.
 */
export const oauthProviderLabels: Record<string, string> = {
  google: "Google",
  linkedin_oidc: "LinkedIn",
  facebook: "Facebook",
  apple: "Apple",
};

/**
 * The linked sign-in methods, in GoTrue's own order.
 *
 * `app_metadata.providers` is the authoritative list; `app_metadata.provider`
 * is the first one and is the only field present on the oldest rows, so it is
 * the fallback. Values are provider ids (`email`, `google`, `linkedin_oidc`).
 */
export function readSignInMethods(
  appMetadata: { provider?: string; providers?: string[] } | undefined,
): string[] {
  const providers = appMetadata?.providers?.filter(Boolean) ?? [];
  if (providers.length > 0) return [...new Set(providers)];

  const provider = appMetadata?.provider;
  return provider ? [provider] : [];
}

export function parseEnabledOAuthProviders(
  value: string | undefined,
): OAuthProvider[] {
  if (!value?.trim()) return [];

  const providers = value.split(",").map((provider) => provider.trim());
  const result = oauthProviderSchema.array().safeParse(providers);
  if (!result.success) {
    throw new Error(
      "AUTH_OAUTH_PROVIDERS must contain only google or linkedin_oidc.",
    );
  }

  return [...new Set(result.data)];
}

/**
 * The advertised providers for a page render, with the strict parser's failure
 * contained.
 *
 * `AUTH_OAUTH_PROVIDERS` is an operator setting, but the login and registration
 * pages read it *during render* to decide which social buttons to enable. The
 * strict parser throws on a typo — an unknown provider name, a stray comma — and
 * an uncaught throw there turns both auth pages into a 500 in every locale, which
 * is exactly the pair of pages a locked-out visitor needs. A malformed value
 * should degrade to the same state as an empty one: email/password sign-in keeps
 * working and the provider cards stay disabled with their "awaiting setup" note.
 *
 * The strict parser is kept for the configuration verifier (`auth:verify`), which
 * is where a bad value must fail loudly.
 */
export function resolveEnabledOAuthProviders(
  read: () => OAuthProvider[],
): OAuthProvider[] {
  try {
    return read();
  } catch {
    return [];
  }
}
