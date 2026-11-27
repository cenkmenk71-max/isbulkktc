"use client";

import { useEffect, useRef } from "react";

/**
 * Kontrol eder `home-hero-photo-cycle` CSS slayt döngüsünün oynatılma durumunu.
 *
 * - Dokunmatik / pointer ile etkileşimdeyken (touchstart / pointerdown) döngüyü
 *   durdurur, parmak çekilince (pointerup / touchend) devam ettirir.
 *   Sayfa arka plana alındığında (document.hidden) duraklatır, geri dönüldüğünde
 *   devam ettirir.
 * - `prefers-reduced-motion: reduce` zaten stylesheet'teki
 *   `@media (prefers-reduced-motion: reduce)` bloğu ile ele alınır (ilk slayt
 *   sabit, diğerleri görünmez, animasyon yok), bu nedenle burada ek bir işlem
 *   yoktur.
 */
export function HeroCycleControl({
  children,
}: {
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pause = () => container.classList.add("hero-cycle--paused");
    const resume = () => container.classList.remove("hero-cycle--paused");

    const onPointerDown = () => pause();
    const onPointerUp = () => resume();

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("touchstart", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("touchend", onPointerUp);

    const onVisibilityChange = () =>
      document.hidden ? pause() : resume();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <div className="hero-cycle-control" ref={containerRef}>
    {children}
  </div>;
}
