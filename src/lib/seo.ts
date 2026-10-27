import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { getAppBaseUrl } from "@/server/config/app-url";

const socialImagePath = "/images/Girne.webp";

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
}: {
  locale: AppLocale;
  pathname: string;
  title: string;
  description: string;
}): Metadata {
  const baseUrl = getAppBaseUrl();
  const canonicalUrl = getLocalizedPageUrl(locale, pathname, baseUrl);
  const defaultLocaleUrl = getLocalizedPageUrl(
    routing.defaultLocale,
    pathname,
    baseUrl,
  );
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
      languages: {
        ...Object.fromEntries(
          routing.locales.map((supportedLocale) => [
            supportedLocale,
            getLocalizedPageUrl(supportedLocale, pathname, baseUrl).toString(),
          ]),
        ),
        "x-default": defaultLocaleUrl.toString(),
      },
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
          width: 3840,
          height: 2500,
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
