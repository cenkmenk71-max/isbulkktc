import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['tr', 'en', 'ru', 'el', 'fa', 'de'],
  defaultLocale: 'tr',
  localePrefix: 'as-needed',
  localeDetection: false,
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
