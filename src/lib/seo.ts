import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { getAppBaseUrl } from "@/server/config/app-url";

// 1200x630 social card derived from the Girne harbour photo at its hero focal
// point. The 3840x2500 hero itself is ~1.9 MB, which exceeds WhatsApp's ~300 KB
// preview budget and makes link unfurls slow on every platform, so the card is
// a separate, lighter asset.
const socialImagePath = "/images/og-cover.webp";
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
  title,
  description,
  contentLocale,
}: {
  locale: AppLocale;
  pathname: string;
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
}): Metadata {
  const baseUrl = getAppBaseUrl();
  // Next.js treats a `URL` instance passed as `alternates.canonical` as a base and
  // re-resolves it against the current request pathname, which prefixes the default
  // locale onto already-canonical URLs (e.g. /freelance -> /tr/freelance). Pass an
  // absolute string so the value is emitted verbatim.
  const canonicalLocale = contentLocale ?? locale;
  const canonicalUrl = getLocalizedPageUrl(
    canonicalLocale,
    pathname,
    baseUrl,
  ).toString();
  const defaultLocaleUrl = getLocalizedPageUrl(
    routing.defaultLocale,
    pathname,
    baseUrl,
  ).toString();
  const openGraphLocales = {
    tr: "tr_TR",
    en: "en_GB",
    ru: "ru_RU",
    el: "el_GR",
    fa: "fa_IR",
    de: "de_DE",
  } satisfies Record<AppLocale, string>;
  const imageUrl = new URL(socialImagePath, baseUrl).toString();

  return {
    title: { absolute: `${title} · İşBul KKTC` },
    description,
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
                    pathname,
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
      type: "website",
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((otherLocale) => otherLocale !== locale)
        .map((otherLocale) => openGraphLocales[otherLocale]),
      images: [
        {
          url: imageUrl,
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
      images: [imageUrl],
    },
  };
}

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
