import type { AppLocale } from "@/i18n/routing";

/**
 * Verbatim operator data for the machine-readable brief and the organization
 * graph. Every value here is taken from the live site or the environment, never
 * invented: the email/phone/region match the contact page and the footer's
 * `social-links` module, and the social URLs come from the `NEXT_PUBLIC_*`
 * variables the footer already renders. A channel without a configured URL is
 * omitted rather than guessed.
 */

export const SITE_NAME = "İşBul KKTC";
export const SUPPORT_EMAIL = "info@isbulkktc.com";
export const SUPPORT_PHONE_TEL = "+905391316421";

/** Municipality the operator publishes as its location ("Alsancak, KKTC"). */
export const LOCATION_LOCALITY = "Alsancak";
export const LOCATION_DISTRICT = "Girne";

/**
 * Region names in the six served languages. The Turkish form is the legal name
 * the site itself uses; the others are the names the site's own localized
 * "location" copy already renders (footer, contact page), so the AI brief never
 * introduces a translation the product does not use.
 */
export const regionNames: Record<AppLocale, string> = {
  tr: "Kuzey Kıbrıs Türk Cumhuriyeti",
  en: "Northern Cyprus",
  de: "Nordzypern",
  fa: "قبرس شمالی",
  ru: "Северный Кипр",
  el: "Βόρεια Κύπρος",
};

/**
 * The six districts the platform serves, in Turkish (the canonical values the
 * job data stores) plus the English names the district data already maps. Used
 * for `areaServed` so an answer engine can name a district, not just a country.
 */
export const servedDistricts: ReadonlyArray<{ tr: string; en: string }> = [
  { tr: "Lefkoşa", en: "Nicosia" },
  { tr: "Gazimağusa", en: "Famagusta" },
  { tr: "Girne", en: "Kyrenia" },
  { tr: "Güzelyurt", en: "Morphou" },
  { tr: "İskele", en: "Trikomo" },
  { tr: "Lefke", en: "Lefka" },
];

function socialUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//.test(trimmed) ? trimmed : null;
}

/**
 * Real social profiles the operator has configured. Mirrors the footer's
 * `getSocialChannels` so the `sameAs` list and the visible links cannot drift.
 */
export function getConfiguredSocialProfiles(): string[] {
  return [
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK_URL,
    process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN_URL,
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE_URL,
    process.env.NEXT_PUBLIC_SOCIAL_X_URL,
  ]
    .map(socialUrl)
    .filter((url): url is string => url !== null);
}

/** A single postal address, shared by the brief and the JSON-LD graph. */
export function buildPostalAddress(baseUrl: URL) {
  return {
    "@type": "PostalAddress",
    addressLocality: LOCATION_LOCALITY,
    addressRegion: LOCATION_DISTRICT,
    addressCountry: "CY",
    url: baseUrl.toString(),
  };
}
