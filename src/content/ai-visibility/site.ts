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
 * The six districts the platform serves. `tr` is the canonical value the job
 * data stores (the `northern_cyprus_district` enum and `JobPosting.jobLocation`
 * both use it), so the organization graph names the same district the vacancy
 * does — "Mağusa", never "Gazimağusa". `names` holds the label the interface
 * shows in each language (the `HomeJobSearch.districts` catalog entries);
 * `alternates` holds the other forms people search for, so an answer engine can
 * match "Gazimağusa" or "Famagusta" without the canonical name drifting.
 */
export const servedDistricts: ReadonlyArray<{
  tr: string;
  names: Record<AppLocale, string>;
  alternates: readonly string[];
}> = [
  {
    tr: "Lefkoşa",
    names: {
      tr: "Lefkoşa",
      en: "Nicosia",
      de: "Nikosia",
      ru: "Никосия",
      el: "Λευκωσία",
      fa: "نیکوزیا",
    },
    alternates: ["Lefkosia", "Nicosia"],
  },
  {
    tr: "Mağusa",
    names: {
      tr: "Mağusa",
      en: "Famagusta",
      de: "Famagusta",
      ru: "Фамагуста",
      el: "Αμμόχωστος",
      fa: "فاماگوستا",
    },
    alternates: ["Gazimağusa", "Famagusta", "Ammochostos"],
  },
  {
    tr: "Girne",
    names: {
      tr: "Girne",
      en: "Kyrenia",
      de: "Kyrenia",
      ru: "Кирения",
      el: "Κερύνεια",
      fa: "گیرنه",
    },
    alternates: ["Kyrenia", "Keryneia"],
  },
  {
    tr: "Güzelyurt",
    names: {
      tr: "Güzelyurt",
      en: "Morphou",
      de: "Morphou",
      ru: "Морфу",
      el: "Μόρφου",
      fa: "مورفو",
    },
    alternates: ["Morphou", "Morfou"],
  },
  {
    tr: "İskele",
    names: {
      tr: "İskele",
      en: "Trikomo",
      de: "Trikomo",
      ru: "Трикомо",
      el: "Τρίκωμο",
      fa: "ترکومو",
    },
    alternates: ["Trikomo"],
  },
  {
    tr: "Lefke",
    names: {
      tr: "Lefke",
      en: "Lefka",
      de: "Lefke",
      ru: "Лефке",
      el: "Λεύκα",
      fa: "لفکه",
    },
    alternates: ["Lefka"],
  },
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
