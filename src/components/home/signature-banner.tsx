'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { MapPin, ShieldCheck, Zap } from 'lucide-react'

export function SignatureBanner() {
  const copy = useTranslations('FeatureStrip')

  return (
    <section className="signature-banner" aria-label={copy('ariaLabel')}>
      <Image
        src="/images/homepage-metal-feature-strip.png"
        alt=""
        fill
        sizes="100vw"
        quality={90}
        loading="eager"
        className="signature-banner-image"
      />
      <ul className="signature-banner-inner" data-reveal>
        <li className="signature-feature">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>{copy('trustedTitle')}</strong>
            <small>{copy('trustedBody')}</small>
          </span>
        </li>
        <li className="signature-feature">
          <MapPin aria-hidden="true" />
          <span>
            <strong>{copy('localTitle')}</strong>
            <small>{copy('localBody')}</small>
          </span>
        </li>
        <li className="signature-feature signature-feature--apply">
          <Zap aria-hidden="true" />
          <span>
            <strong>{copy('applyTitle')}</strong>
            <small>{copy('applyBody')}</small>
          </span>
        </li>
      </ul>
    </section>
  )
}
