# LANE-TASARIM — UI/UX, görsel kalite, motion, erişilebilirlik

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- **İki görsel guard var, ikisi de geçmeden iş bitmez:**
  - `tests/e2e/accessibility.spec.ts` → axe-core, 6 dilde tüm public rotalar (mobil her yerde; desktop tr/de/fa).
  - `tests/unit/design-tokens.test.ts` → WCAG kontrast tabanları, palet çapaları, radius/tipografi, ve `@theme` dışında yeni hardcoded hex'e karşı ratchet.
- `npm run check:frontend-source` (175 assertion): palet token'ları, kontrast, yüklenen foto bütçeleri, 6-dil routing, motion kuralları.
- **Motion katmanı:** tek client controller (`src/components/motion/motion-controller.tsx`), RSC'ler sadece `data-reveal`/`data-tilt` taşır. GSAP `autoAlpha` YASAK (axe `visibility:hidden` atlar). `prefers-reduced-motion` desteklenir.
- **Erişilebilir isimler görünür metni içermeli (WCAG 2.5.3).** Gereksiz `aria-label` yazma; yoksa görünür metin kullanılır.
- Yeni renk gerekiyorsa `@theme`'ye taşı; `design-token-drift.baseline.json` **sadece küçülebilir**.

## Sahip olduğun yollar
`src/components/**`, `src/experience/**`, `src/assets/**`, ve kendi guard dosyaların:
`tests/e2e/accessibility.spec.ts`, `tests/unit/design-tokens.test.ts`,
`tests/unit/design-token-drift.baseline.json`.
**`src/app/[locale]/**` route/layout dosyaları SENİN DEĞİL** (sahibi LANE-SEO).
Görsel/JSX değişikliği gerekiyorsa `docs/lanes/05-tasarim.md`'ye TODO yaz; LANE-SEO uygular.

## Yapılacaklar
1. **Görsel tutarlılık:** spacing/radius/tipografi ölçeği her yerde mi? Tek tük hardcoded değer avı.
2. **Responsive:** 6 dilde (özellikle `de` en uzun stringler, `fa` RTL) kırılma var mı? Mobil/tablet/masaüstü.
3. **Erişilebilirlik:** kontrast, odak halkaları, klavye gezinme, `aria-*` doğruluğu, dokunma hedefleri ≥44px.
4. **Motion:** animasyonlar `prefers-reduced-motion`'da kapanıyor mu; LCP/CLS'e zarar var mı; `opacity:0` ile başlayan kartların kontrast ölçümü animasyon ortasında düşüyor mu (bileşeni düzelt, testi değil).
5. **3D/WebGL sahneler:** yük-duyarlı; yavaş cihazda graceful degradation var mı.

## Kurallar
- **"Görsel değişiklik yok" iddiasını pikselle kanıtla:** öncesi/sonrası `locator.screenshot` (`deviceScaleFactor: 2`) + `sharp` ile buffer diff.
- Bir guard'ı **negatif test et**: düzeltmeyi geri al, guard'ın gerçek sayıyla düştüğünü gör.
- Gate regex'leri yorumları da yakalar (ör. `opacity\s*:`), dikkat.
- Yeni hex → `@theme`; baseline listesi büyüyemez.

## Raporla
Bulgu + düzeltme + piksel kanıtı + çalıştırılan gate sonuçları. Branch + PR, CI (özellikle accessibility + design-tokens) yeşil.
