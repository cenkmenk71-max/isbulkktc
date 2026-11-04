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

---

## LANE-TASARIM çalışma notları (2026-11-04, tur 2)

Branch: `lane/tasarim`. Karşılaştırma tabanı: `origin/main` @ `77d2a04`.

İlk turdaki iki bulgu (auth kartı kontrastı, E2E shard dengesi) artık `main`'de
(PR #106) — kuyrukta bekleyen `agent:frontend` issue'lardan #95 çözüldü; #101
`LANE-URUN`'un ve `agent:blocked`. Bu yüzden brief'in 4. maddesinden (motion /
opacity) en yüksek etkili, sınırlı bir bulgu seçildi.

### Bulgu 3 — `packages-rise-in` keyframe'i hiç tanımlanmamış; hero girişi hiç oynamıyordu (düzeltildi)

- **Belirti:** `/packages` (6 dil) hero metni (`.packages-hero-copy`) hiç giriş
  animasyonu olmadan beliriyordu.
- **Kök neden:** Kural `animation: packages-rise-in 0.68s var(--ease-premium) both;`
  diyor, ama `@keyframes packages-rise-in` **hiçbir yerde tanımlı değil** (tüm
  repoda tek referans kuralın kendisi). Adı çözülemeyen animasyon sessizce hiç
  çalışmaz — bu yüzden ne `check:frontend-source` ne de mevcut testler göremedi.
  İlk proje aktarımından (`3dfe8e8`) beri böyle.
- **Düzeltme:** `src/styles/global.css` — keyframe eklendi; hero metni
  `translateY(18px)`'den yükseliyor, **opak** (opacity fade yok). Aynı gerekçe
  `editorial-page-enter`/`consent-card-in` için de geçerli: yarı saydam kart/panel
  metni arkadaki yüzeye kompozitlenince AA altına düşüyor. `backwards` dolgu ile
  ilk kare başlangıç offsetini tutuyor, sonra transform bırakılıyor → oturmuş
  durum **birebir eskisi gibi**.
- **Kanıt (piksel, `deviceScaleFactor: 2`, sharp buffer diff):**
  - Oturmuş durum (reduced-motion ile tüm ambient animasyonlar donuk), öncesi↔sonrası
    **byte-identical**: md5 `35fe687a22f7` = `35fe687a22f7`, **0/3174400 px** değişti.
  - İlk kare (sayfadaki tüm animasyonlar `currentTime=0`'da donduruldu), öncesi↔sonrası:
    **163401/3174400 px (%5.15), maxDelta 245** — yani giriş offseti artık gerçekten var.
  - `getAnimations()`: öncesi `[]`, sonrası `[{name:"packages-rise-in", playState:"running"}]`.
- **Guard (negatif test edildi):**
  - `tests/unit/design-tokens.test.ts` — yeni test "every animation a rule plays has a
    matching @keyframes": her kuralın oynattığı animasyon adını toplar ve `@keyframes`
    tanımı olmasını şart koşar. Keyframe geri alınınca kırmızı (`packages-rise-in`
    değeriyle), eklenince yeşil.
  - Mevcut "card entrance animations never fade opacity" testi `.packages-hero-copy`
    seçicisini de kapsayacak şekilde genişletildi (aynı sınıf hata: fade eden kart).

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (365 test, +1 yeni)
- `tests/e2e/packages.spec.ts` ✅ 3 passed (1 worker; 4 worker'da WebGL yük flake'i —
  AGENTS.md'de bilinen durum, bu değişiklikle ilgisiz)
- `tests/e2e/accessibility.spec.ts -g packages` ✅ 9 passed

### Sahibin yapması gerekenler / sonraki notlar

- **Axe guard'ı yeni public rotaları kapsamıyor (takip işi).** `tests/e2e/accessibility.spec.ts`
  içindeki `publicRoutes` 14 statik rota içeriyor; sonradan eklenen `/sss` (FAQ),
  `/rehber` + `/rehber/[slug]` (rehberler), `/blog/[slug]` (makaleler),
  `/is-ilanlari/[district]` ve `/is-turleri/[type]` **hiç taranmıyor**. Elle axe
  probu (6 dil × 6 rota × mobil; tr/de/fa ayrıca masaüstü = 54 test) bu rotaların
  hepsinde **temiz** olduğunu gösterdi, ama regresyon guard'ı yok. Sahibi
  LANE-TASARIM olduğu için ayrı ve sınırlı bir PR'da eklenmeli (bu PR'ı dar tutmak
  için buraya alınmadı).
- `src/styles/global.css` hiçbir lane'in sahiplik tablosunda **yok** (ilk turdan
  not): TASARIM yalnızca görsel guard'ların okuduğu design-system sheet olduğu için
  düzenliyor. Sahiplik tablosuna açık satır eklemek INFRA'nın işi.
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`.
  İkisi de bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-04)

Branch: `lane/tasarim`. Karşılaştırma tabanı: `origin/main` @ `b5b11cc`.

### Bulgu 1 — Animasyon ortasında AA altına düşen auth CTA kontrastı (düzeltildi)

- **Belirti:** `/login`, `/register`, `/forgot-password` (tüm 6 dil) yüklenirken
  kartın giriş animasyonu sırasında axe `color-contrast` ihlali veriyor:
  `.editorial-submit` etiketi 2.3–4.2:1 (gereken 4.5:1). Oturmuş durumda 4.66:1,
  yani CI'ın mevcut `waitForTimeout(600)` + "sonlu animasyonları bekle" mantığı
  bunu **gizliyor**; gerçek ziyaretçi yine de kısa bir başarısız-kontrast flaşı görüyor.
- **Kök neden:** `@keyframes editorial-page-enter` `opacity: 0 → 1` animasyonluyor.
  `.editorial-page-layout` (auth kartı) bunu oynatıyor. Etiketin marka mavisi açık
  yüzeyde AA'yı yalnızca ~0.16 puan geçiyor; kart yarı saydamken etiket arkadaki
  sayfaya doğru kompozitleniyor ve oran çöküyor.
- **Düzeltme:** `src/styles/global.css` — `editorial-page-enter` artık yalnızca
  `transform: translateY(...)`; opaklık fade'i kaldırıldı (`consent-card-in` ile
  aynı kural, aynı gerekçe). Görsel olarak oturmuş durum birebir aynı kaldı.
- **Kanıt (piksel):** oturmuş `.editorial-page-layout` ekran görüntüleri
  (`deviceScaleFactor: 2`) öncesi/sonrası **byte-identical** (md5 eşit: login,
  register, forgot-password). Animasyon ortasında ise kart sonrası tam opak:
  stddev 62.9 → 78.2 (login). Yani "görsel değişiklik yok" yalnızca *son* durum
  için geçerli; amaçlanan tek fark animasyon ortası kontrastı.
- **Guard:** `tests/unit/design-tokens.test.ts` — yeni test
  "card entrance animations never fade opacity under AA-fragile labels":
  `.editorial-page-layout` ve `.consent-card` seçicilerinden `animation`
  kısayolunu okuyup oynattığı `@keyframes` gövdesinde `opacity` olmadığını
  doğruluyor. Negatif test: fade geri konunca test kırmızı, kaldırınca yeşil.

### Bulgu 2 — E2E shard dengesizliği, issue #95 (düzeltildi)

- `tests/e2e/accessibility.spec.ts` dil başına **tek** testte ~26 rota geziyordu;
  Playwright test düzeyinde shard'ladığı için bir shard ~9 dakikaya çıkıyordu.
- Rota düzeyinde testlere bölündü: **126 test** (6×14 mobil + 3×14 masaüstü),
  kapsam birebir aynı (aynı diller, rotalar, axe etiketleri, settle mantığı).
- Shard dağılımı artık 32/32/31/31 (öncesi 6 dengesiz test). Tam suite yerel
  dev sunucusuna karşı 4 worker ile **126 passed (6.5m)**.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (354 test, +1 yeni)
- `accessibility.spec.ts` tam suite (dev sunucusu, 4 worker) ✅ 126 passed

### Sahibin yapması gerekenler / notlar

- `src/styles/global.css` hiçbir lane'in sahiplik tablosunda **yok**. Bu lane onu
  yalnızca görsel guard'ların okuduğu design-system sheet olduğu ve geçmiş
  tasarım PR'ları (ör. #65) onu değiştirdiği için düzenledi. Sahiplik tablosuna
  açık bir satır (ör. TASARIM) eklemek iyi olur — INFRA'nın işi.
- Değişen dosyalar: `src/styles/global.css`, `tests/e2e/accessibility.spec.ts`,
  `tests/unit/design-tokens.test.ts`. Hepsi bu lane'in kapsamında.
