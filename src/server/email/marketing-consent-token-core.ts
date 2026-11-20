import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MARKETING_CONSENT_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;
const CONSENT_TOKEN_DOMAIN = "isbulkktc:marketing-consent:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES = ["tr", "en", "ru", "el", "fa", "de"] as const;

export type MarketingConsentLocale = (typeof LOCALES)[number];
export type MarketingConsentClaims = {
  version: 1;
  leadId: string;
  locale: MarketingConsentLocale;
  emailHash: string;
  expiresAt: number;
};

function signature(payload: string, key: string): string {
  return createHmac("sha256", key)
    .update(CONSENT_TOKEN_DOMAIN + "." + payload)
    .digest("base64url");
}

export function createMarketingConsentToken(
  leadId: string,
  locale: string,
  email: string,
  key: string,
  nowMs = Date.now(),
): string {
  if (!UUID.test(leadId)) throw new TypeError("A valid sales lead UUID is required.");
  if (!(LOCALES as readonly string[]).includes(locale)) {
    throw new TypeError("A supported email locale is required.");
  }
  if (key.trim().length < 16) throw new TypeError("The signing key is too short.");

  const claims: MarketingConsentClaims = {
    version: 1,
    leadId,
    locale: locale as MarketingConsentLocale,
    emailHash: createHash("sha256").update(email.trim().toLowerCase()).digest("hex"),
    expiresAt: Math.floor(nowMs / 1000) + MARKETING_CONSENT_TOKEN_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return payload + "." + signature(payload, key);
}

export function verifyMarketingConsentToken(
  token: string,
  key: string,
  nowMs = Date.now(),
): MarketingConsentClaims | null {
  if (!token || token.length > 2048 || key.trim().length < 16) return null;
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) return null;

  const expected = Buffer.from(signature(parts[0], key));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const decoded = Buffer.from(parts[0], "base64url").toString("utf8");
    const value = JSON.parse(decoded) as Partial<MarketingConsentClaims>;
    const now = Math.floor(nowMs / 1000);
    if (
      value.version !== 1 ||
      typeof value.leadId !== "string" ||
      !UUID.test(value.leadId) ||
      typeof value.locale !== "string" ||
      !(LOCALES as readonly string[]).includes(value.locale) ||
      typeof value.emailHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.emailHash) ||
      typeof value.expiresAt !== "number" ||
      !Number.isInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + MARKETING_CONSENT_TOKEN_TTL_SECONDS + 60
    ) return null;

    return value as MarketingConsentClaims;
  } catch {
    return null;
  }
}
