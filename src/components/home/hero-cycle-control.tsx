'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * HeroCycleControl keeps the homepage district photo cycle running smoothly on
 * mobile and desktop, then pauses it the moment a visitor touches the hero so
 * the finger isn't fighting a sliding image, and resumes when the touch ends.
 * It also pauses while the tab is in the background (`document.hidden`) so the
 * ray/slide compositing stops burning CPU and battery.
 *
 * The actual cycle is a CSS animation (`home-hero-photo-cycle`,
 * `home-hero-rays-drift`) declared in `src/styles/global.css`; this component
 * only toggles `animation-play-state` through a `data-cycle-paused` attribute
 * so the animation declaration, its timings and the E2E contract (`loading`,
 * `fetchPriority`, `animation-delay`, `animation-duration`) stay untouched.
 */
export function HeroCycleControl({
  children,
}: {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  const pause = useCallback(() => {
    ref.current?.setAttribute('data-cycle-paused', 'true')
  }, [])

  const resume = useCallback(() => {
    ref.current?.removeAttribute('data-cycle-paused')
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const onPause = () => pause()
    const onResume = () => resume()

    element.addEventListener('pointerdown', onPause)
    element.addEventListener('pointerup', onResume)
    element.addEventListener('pointercancel', onResume)
    element.addEventListener('touchstart', onPause, { passive: true })
    element.addEventListener('touchend', onResume, { passive: true })
    element.addEventListener('touchcancel', onResume, { passive: true })

    const onVisibilityChange = () =>
      document.hidden ? pause() : resume()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      element.removeEventListener('pointerdown', onPause)
      element.removeEventListener('pointerup', onResume)
      element.removeEventListener('pointercancel', onResume)
      element.removeEventListener('touchstart', onPause)
      element.removeEventListener('touchend', onResume)
      element.removeEventListener('touchcancel', onResume)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [pause, resume])

  return <div ref={ref} className="hero-cycle-control">{children}</div>
}
