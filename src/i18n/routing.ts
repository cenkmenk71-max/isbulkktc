import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['tr', 'en', 'ru', 'el', 'fa', 'de'],
  defaultLocale: 'tr',
  localePrefix: 'as-needed',
  localeDetection: false,
  // next-intl's middleware otherwise sets a `Link` response header advertising
  // every locale variant of the request path. That is wrong here on two counts:
  // job-detail pages serve one Turkish text under all six prefixes and
  // canonicalise to the default locale, so the header would advertise five
  // non-canonical URLs as alternates; and the header is emitted for any path,
  // including 404s. The genuine, localized routes already declare their
  // alternates in the HTML `<head>` via `createLocalizedPageMetadata`, so the
  // header is redundant there and misleading everywhere else.
  alternateLinks: false,
})

export type AppLocale = (typeof routing.locales)[number]

export function isAppLocale(locale: string): locale is AppLocale {
  return routing.locales.some((supportedLocale) => supportedLocale === locale)
}

export const localeNames: Record<AppLocale, string> = {
  tr: 'Türkçe',
  en: 'English',
  ru: 'Русский',
  el: 'Ελληνικά',
  fa: 'فارسی',
  de: 'Deutsch',
}

export function isRightToLeftLocale(locale: AppLocale): boolean {
  return locale === 'fa'
}

export function getLocalePrefix(locale: AppLocale): string {
  return locale === routing.defaultLocale ? '' : `/${locale}`
}
