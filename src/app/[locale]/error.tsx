'use client'

import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

type LocaleErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function LocaleError({ error, reset }: LocaleErrorProps) {
  const t = useTranslations('AppError')
  const supportReference = error.digest?.trim().slice(0, 80)

  return (
    <section className="page-container route-error" role="alert">
      <span className="route-error-mark" aria-hidden="true">
        <span>!</span>
      </span>
      <p className="route-error-eyebrow">{t('eyebrow')}</p>
      <h1>{t('title')}</h1>
      <p className="route-error-description">{t('body')}</p>
      {supportReference ? (
        <p className="route-error-description" aria-live="polite">
          {t('supportReference', { digest: supportReference })}
        </p>
      ) : null}
      <div className="route-error-actions">
        <button className="button button-dark" type="button" onClick={reset}>
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
