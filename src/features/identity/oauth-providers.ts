import { oauthProviderSchema, type OAuthProvider } from "./schemas";

export function parseEnabledOAuthProviders(
  value: string | undefined,
): OAuthProvider[] {
  if (!value?.trim()) return [];

  const providers = value.split(",").map((provider) => provider.trim());
  const result = oauthProviderSchema.array().safeParse(providers);
  if (!result.success) {
    throw new Error(
      "AUTH_OAUTH_PROVIDERS must contain only google, linkedin_oidc, or facebook.",
    );
  }

  return [...new Set(result.data)];
}
