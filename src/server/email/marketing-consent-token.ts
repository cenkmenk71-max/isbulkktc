import "server-only";

import { getAppBaseUrl } from "@/server/config/app-url";
import { resolveUnsubscribeSigningKey } from "./unsubscribe-signature";
import {
  createMarketingConsentToken,
  verifyMarketingConsentToken,
  type MarketingConsentClaims,
} from "./marketing-consent-token-core";

export function marketingConsentConfirmationUrlFor(
  leadId: string,
  locale: string,
  email: string,
): string | null {
  const key = resolveUnsubscribeSigningKey();
  if (!key) return null;

  const token = createMarketingConsentToken(leadId, locale, email, key);
  const url = new URL("/api/email/confirm-marketing", getAppBaseUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export function verifyMarketingConsentConfirmationToken(
  token: string,
): MarketingConsentClaims | null {
  const key = resolveUnsubscribeSigningKey();
  if (!key) return null;
  return verifyMarketingConsentToken(token, key);
}
