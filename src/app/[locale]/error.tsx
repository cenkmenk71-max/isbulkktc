'use client'

import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

type LocaleErrorProps = {
  error: Error & { digest?: string }
  retry: () => void
}

export default function LocaleError({ retry }: LocaleErrorProps) {
  const t = useTranslations('AppError')

  return (
    <section className="page-container route-error" role="alert">
      <span className="route-error-mark" aria-hidden="true">
        <span>!</span>
      </span>
      <p className="route-error-eyebrow">{t('eyebrow')}</p>
      <h1>{t('title')}</h1>
      <p className="route-error-description">{t('body')}</p>
      <div className="route-error-actions">
        <button className="button button-dark" type="button" onClick={retry}>
          <RefreshCw size={16} aria-hidden="true" />
          {t('retry')}
        </button>
        <Link
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
          href="/"
        >
          {t('home')}
        </Link>
      </div>
    </section>
  )
}
