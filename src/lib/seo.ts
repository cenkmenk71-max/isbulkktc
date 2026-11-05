import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import {
  getLocalizedSlugPathnames,
  resolveLocalizedSlugPathname,
} from "@/lib/localized-slug-pathnames";
import { getAppBaseUrl } from "@/server/config/app-url";

export { getLocalizedSlugPathnames, resolveLocalizedSlugPathname };

// 1200x630 social card derived from the Girne harbour photo at its hero focal
// point. The 3840x2500 hero itself is ~1.9 MB, which exceeds WhatsApp's ~300 KB
// preview budget and makes link unfurls slow on every platform, so the card is
// a separate, lighter asset.
const socialImagePath = "/images/og-cover.webp";
const socialImageType = "image/webp";
const socialImageWidth = 1200;
const socialImageHeight = 630;

const socialImageAlts: Record<AppLocale, string> = {
  tr: "Girne Limanı ve Kuzey Kıbrıs kıyı şeridi",
  en: "Kyrenia Harbour and the Northern Cyprus coastline",
  ru: "Порт Кирении и побережье Северного Кипра",
  el: "Το λιμάνι της Κερύνειας και η ακτογραμμή της Βόρειας Κύπρου",
  fa: "بندر گیرنه و خط ساحلی قبرس شمالی",
  de: "Der Hafen von Kyrenia und die Küste Nordzyperns",
};

export function getLocalizedSocialImageAlt(locale: AppLocale): string {
  return socialImageAlts[locale];
}

/**
 * Open Graph locale codes, keyed by app locale. Shared by the locale layout and
 * every page-level metadata builder so the two can never drift: a page whose
 * `og:locale` disagrees with its layout's `alternateLocale` list is an
 * inconsistent graph, and duplicating the map is how that happens.
 */
export const openGraphLocales = {
  tr: "tr_TR",
  en: "en_GB",
  ru: "ru_RU",
  el: "el_GR",
  fa: "fa_IR",
  de: "de_DE",
} satisfies Record<AppLocale, string>;

/**
 * Default social card for routes that carry no page-level metadata of their own
 * (auth pages, the 404 page). Those routes inherit the locale layout's
 * `generateMetadata`, so the layout must advertise the same light 1200x630 card
 * as `createLocalizedPageMetadata`; pointing it at the full-resolution hero
 * would put a ~1.9 MB image behind every unfurl on those routes.
 */
export function getDefaultSocialImage(locale: AppLocale, baseUrl: URL) {
  return {
    url: new URL(socialImagePath, baseUrl).toString(),
    type: socialImageType,
    width: socialImageWidth,
    height: socialImageHeight,
    alt: getLocalizedSocialImageAlt(locale),
  };
}

export function getLocalizedPageUrl(
  locale: AppLocale,
  pathname: string,
  baseUrl: URL,
): URL {
  const localizedPath =
    locale === routing.defaultLocale
      ? pathname
      : pathname === "/"
        ? `/${locale}`
        : `/${locale}${pathname}`;

  return new URL(localizedPath, baseUrl);
}

export function createLocalizedPageMetadata({
  locale,
  pathname,
  localizedPathnames,
  title,
  description,
  contentLocale,
  openGraphType = "website",
}: {
  locale: AppLocale;
  pathname: string;
  /**
   * Locale → pathname for content whose slug is translated per locale. When
   * present, both the canonical and every `hreflang` alternate are built from
   * it instead of from `pathname`; without it, prefixing one language's slug
   * with another language's prefix advertises URLs that 404. See
   * `getLocalizedSlugPathnames`.
   */
  localizedPathnames?: Record<AppLocale, string>;
  title: string;
  description: string;
  /**
   * Locale that actually owns the page text. Imported source listings are
   * Turkish whichever URL prefix serves them, so those pages pass the default
   * locale here: every locale then canonicalises to the single URL that owns
   * the content and the hreflang alternates are dropped, because they would
   * otherwise advertise six URLs carrying identical text.
   */
  contentLocale?: AppLocale;
  /**
   * OGP object type. Editorial pages that carry `Article` structured data
   * declare `article` here so the social graph agrees with the page's own
   * `@type`; everything else is the default `website`.
   */
  openGraphType?: "website" | "article";
}): Metadata {
  const baseUrl = getAppBaseUrl();
  // Next.js treats a `URL` instance passed as `alternates.canonical` as a base and
  // re-resolves it against the current request pathname, which prefixes the default
  // locale onto already-canonical URLs (e.g. /freelance -> /tr/freelance). Pass an
  // absolute string so the value is emitted verbatim.
  const pathnameFor = (targetLocale: AppLocale) =>
    localizedPathnames?.[targetLocale] ?? pathname;
  const canonicalLocale = contentLocale ?? locale;
  const canonicalUrl = getLocalizedPageUrl(
    canonicalLocale,
    pathnameFor(canonicalLocale),
    baseUrl,
  ).toString();
  const defaultLocaleUrl = getLocalizedPageUrl(
    routing.defaultLocale,
    pathnameFor(routing.defaultLocale),
    baseUrl,
  ).toString();
  const imageUrl = new URL(socialImagePath, baseUrl).toString();

  return {
    title: { absolute: `${title} · İşBul KKTC` },
    description,
    robots: { googleBot: googleBotHints },
    alternates: {
      canonical: canonicalUrl,
      ...(contentLocale
        ? {}
        : {
            languages: {
              ...Object.fromEntries(
                routing.locales.map((supportedLocale) => [
                  supportedLocale,
                  getLocalizedPageUrl(
                    supportedLocale,
                    pathnameFor(supportedLocale),
                    baseUrl,
                  ).toString(),
                ]),
              ),
              "x-default": defaultLocaleUrl.toString(),
            },
          }),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "İşBul KKTC",
      type: openGraphType,
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((otherLocale) => otherLocale !== locale)
        .map((otherLocale) => openGraphLocales[otherLocale]),
      images: [
        {
          url: imageUrl,
          type: socialImageType,
          width: socialImageWidth,
          height: socialImageHeight,
          alt: getLocalizedSocialImageAlt(locale),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: getLocalizedSocialImageAlt(locale),
        },
      ],
    },
  };
}

/**
 * Googlebot display hints carried by every indexable page.
 *
 * These live on the page rather than on the locale layout because the layout
 * also wraps the 404 route: Next injects a `noindex` `<meta name="robots">` for
 * a 404, and a layout-level `googlebot: index, follow` would then sit beside it
 * as a second, contradictory directive. Google reads the two tags together and
 * takes the most restrictive rule, so the contradiction is resolved in Google's
 * favour — but every other crawler that honours only the `googlebot` token is
 * told the opposite of what the page means. Declaring the hints per page keeps
 * the 404 with a single unambiguous directive.
 */
const googleBotHints = {
  index: true,
  follow: true,
  "max-image-preview": "large",
  "max-snippet": -1,
  "max-video-preview": -1,
} as const;

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};
