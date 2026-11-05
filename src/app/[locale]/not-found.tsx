import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { getDefaultSocialImage, openGraphLocales } from '@/lib/seo'
import { getAppBaseUrl } from '@/server/config/app-url'

/**
 * The 404 owns its own title and social card.
 *
 * Without a page-level `metadata` export the response inherits the locale
 * layout's, so a missing page advertised itself as the home page in the tab
 * title *and* in every `og:`/`twitter:` tag. The layout also wraps the 404, so
 * this file is the only place that can override it.
 *
 * No `robots` directive is set here: Next injects `<meta name="robots"
 * content="noindex">` for a 404 by itself, and declaring one as well emitted a
 * second, duplicate tag (the e2e suite asserts exactly one).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale =
    routing.locales.find(
      (supportedLocale) => supportedLocale === requestedLocale,
    ) ?? routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'NotFound' })
  const title = t('title')
  const siteUrl = getAppBaseUrl()
  const socialImage = getDefaultSocialImage(locale, siteUrl)

  return {
    title,
    // The social block is built from this page's own copy. Left to the layout it
    // would carry the home-page title and description, so a broken link shared
    // in a chat unfurled as the home page.
    openGraph: {
      title,
      description: t('body'),
      siteName: 'İşBul KKTC',
      type: 'website',
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((otherLocale) => otherLocale !== locale)
        .map((otherLocale) => openGraphLocales[otherLocale]),
      images: [socialImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: t('body'),
      images: [{ url: socialImage.url, alt: socialImage.alt }],
    },
  }
}

export default function NotFoundPage() {
  const t = useTranslations('NotFound')

  return (
    <section className="page-container flex min-h-[60svh] flex-col items-center justify-center gap-6 py-24 text-center">
      <p className="font-mono text-sm tracking-wider text-vanadium-600 uppercase">
        404
      </p>
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
        {t('title')}
      </h1>
      <p className="max-w-md text-vanadium-700">{t('body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={buttonVariants({ size: 'lg' })}>
          {t('home')}
        </Link>
        <Link
          href="/register"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          {t('register')}
        </Link>
      </div>
    </section>
  )
}
