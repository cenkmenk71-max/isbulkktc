import "server-only";

import { parseEnabledOAuthProviders } from "@/features/identity/oauth-providers";

export function getEnabledOAuthProviders() {
  return parseEnabledOAuthProviders(process.env.AUTH_OAUTH_PROVIDERS);
}
