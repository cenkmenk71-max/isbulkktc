'use client'

import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

type LocaleErrorKey =
  | 'eyebrow'
  | 'title'
  | 'body'
  | 'retry'
  | 'home'
  | 'supportReference'

type LocaleErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function LocaleError({ error, reset }: LocaleErrorProps) {
  let t: (key: LocaleErrorKey, values?: { digest: string }) => string
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    t = useTranslations('AppError') as unknown as typeof t
  } catch {
    const fallback: Record<Exclude<LocaleErrorKey, 'supportReference'>, string> = {
      eyebrow: 'HATA',
      title: 'Bir hata oluştu.',
      body: 'İstenen sayfa yüklenirken beklenmeyen bir hata meydana geldi.',
      retry: 'Yeniden dene',
      home: 'Ana sayfaya dön',
    }
    t = (key, values) =>
      key === 'supportReference'
        ? `Destek kodu: ${values?.digest ?? ''}`
        : fallback[key] ?? key
  }

  const supportReference =
    typeof error.digest === 'string' ? error.digest.trim().slice(0, 80) : ''

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
