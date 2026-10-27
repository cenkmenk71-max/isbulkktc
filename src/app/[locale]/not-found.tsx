import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

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
