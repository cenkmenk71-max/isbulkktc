import Image from 'next/image'
import { cn } from '@/lib/utils'

type LogoProps = { className?: string; tone?: 'light' | 'dark' }

/**
 * Official symbol supplied by the brand owner. The surrounding white canvas is
 * transparent in the exported assets; the source drawing is preserved unchanged.
 * On dark surfaces only the symbol color is reversed for contrast.
 */
export function Logo({ className, tone = 'light' }: LogoProps) {
  const source = tone === 'dark'
    ? '/images/isbul-logo-mark-white.png'
    : '/images/isbul-logo-mark-black.png'

  return (
    <span
      className={cn('brand-lockup', `brand-lockup--${tone}`, className)}
      role="img"
      aria-label="İşBul KKTC"
    >
      <Image
        className="brand-waveform"
        src={source}
        alt=""
        aria-hidden="true"
        width={1295}
        height={766}
        sizes="(max-width: 740px) 48px, 68px"
      />
      <span className="brand-wordmark" aria-hidden="true">
        <strong>İşBul</strong>
        <small>KKTC</small>
      </span>
    </span>
  )
}
