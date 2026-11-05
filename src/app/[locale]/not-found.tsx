import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * The 404 owns its own `title`.
 *
 * Without this the response inherits the locale layout's `Meta.title`, so a
 * missing page advertised itself as the home page ("İşBul KKTC — KKTC ve Kuzey
 * Kıbrıs İş İlanları"). The layout also wraps the 404, so a page-level metadata
 * export is the only place that can override it.
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
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  )
  const t = await getTranslations({
    locale: locale ?? routing.defaultLocale,
    namespace: 'NotFound',
  })

  return { title: t('title') }
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
