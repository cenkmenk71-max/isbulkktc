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

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 3)

Branch: `lane/tasarim`. Karşılaştırma tabanı: `origin/main` @ `e188283`.
Kuyrukta `agent:frontend` + `lane:tasarim` etiketli iki issue vardı: **#144**
(dil değiştirici çevrilmiş slug) ve **#95** (axe spec shard dengesi). #95 zaten
`main`'de çözülmüş (spec rota düzeyinde testlere bölünmüş, `grep -c "test("` =
1 → 180 test); kapatma notu bırakıldı. Bu yüzden #144 + micro-denetim bulgusu
işlendi.

### Bulgu 1 — Dil menüsü her dil öneki altında mevcut slug'ı tekrar ediyordu; çevrilmiş içerikte 5 ölü link (düzeltildi, #144)

- **Belirti:** `/de/rehber/arbeit-finden-in-nordzypern` sayfasının dil menüsü
  `/en/rehber/arbeit-finden-in-nordzypern` gibi var olmayan URL'ler üretiyordu
  (İngilizce slug `finding-a-job-in-northern-cyprus`).
- **Kök neden:** `src/components/layout/site-header.tsx:94` dil linkini ham
  `usePathname()` değeriyle kuruyordu (`href={pathname}`); `usePathname()` öneksiz
  ama *mevcut dilin* slug'ını taşıyor. Rehber/blog slug'ları dile göre çevrildiği
  için bu URL'ler 404.
- **Düzeltme:** `src/components/layout/language-links.ts` — `resolveLanguageHref(
  pathname, targetLocale)`. `[slug]` taşıyan aileleri (`rehber`, `blog`) tanır ve
  hedef dilin kardeş slug'ını konumla çözer (`resolveLocalizedSlugPathname`,
  LANE-SEO'nun hazır saf yardımcısı). Çevrilmemiş rota / bilinmeyen slug / farklı
  uzunlukta liste → eski davranış (ham pathname) korunur.
- **Neden slug manifesti, içerik modülünü import etmek değil:** header bir client
  component ve Next onu sunucuda da render ediyor, yani doğru href SSR HTML'inde
  olmalı (issue'nun `curl` kanıtı tam da SSR çıktısıydı). `@/content/guides` +
  `@/content/editorial` import edilince header chunk'ı **26 945 → 135 446 byte**
  (gzip 8 723 → 47 920) büyüdü; slug-only tablo ile **28 716 byte** (gzip 9 614),
  yani her sayfaya ~+0.9 KB gzip. Tablo, `language-links.test.ts` içinde içerik
  modüllerinden türetilen slug'larla karşılaştırılıyor — yeni rehber/yazı eklenince
  test kırmızı olur, kopya sessizce eskimez.
- **Kanıt (SSR, üretim standalone sunucusu):** `/de/rehber/…` artık
  `/tr/rehber/kktc-is-bulma-rehberi`, `/en/rehber/finding-a-job-in-northern-cyprus`,
  … üretiyor. 6 dil × (3 rehber + 3 yazı) sayfasındaki **180 dil linki tarandı, 0
  tanesi 404** (default-locale linki 308 ile kanonikleşir, hedefi doğru).
- **Kanıt (piksel, `deviceScaleFactor: 2`, sharp buffer diff):** dil menüsü açık
  header görüntüsü öncesi↔sonrası **0/343040 px** değişti, maxDelta 0 — yani
  görsel çıktı birebir aynı, değişen tek şey `href` değerleri.
- **Guard:** `src/components/layout/language-links.test.ts` (9 test). Negatif test
  edildi: resolver gövdesi `return pathname` ile değiştirilince 3 test kırmızı,
  geri alınınca yeşil.

### Bulgu 2 — axe guard'ı altı rota ailesini hiç taramıyordu (düzeltildi)

- **Belirti:** `tests/e2e/accessibility.spec.ts` içindeki `publicRoutes` 14 statik
  rota içeriyordu; sonradan eklenen `/sss`, `/rehber` + `/rehber/[slug]`,
  `/blog/[slug]`, `/is-ilanlari/[district]`, `/is-turleri/[type]` **hiç
  taranmıyordu** (önceki turun notlarında takip işi olarak duruyordu).
- **Etki:** FAQ akordeonu, rehber CTA satırı veya ilçe çapraz linklerindeki bir
  kontrast/hedef-boyutu regresyonu kimse görmeden yayınlanabilirdi.
- **Düzeltme:** rota listesine statik iki rota eklendi; ilçe/iş-türü slug'ları
  `districtSlug`/`jobTypeSlugs` ile, çevrilmiş detay rotaları `getGuides(locale)`/
  `getArticles(locale)` ile dil başına kuruluyor. Test sayısı **126 → 180**;
  assertion kapsamı aynı (aynı diller, viewport mantığı, axe etiketleri, settle).
- **Kanıt:** 180/180 axe testi yerel dev sunucusuna karşı geçti (9.5m, 3 worker).
  Yeni 45 test ayrıca tek başına geçti.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (469 test, +9 yeni)
- `bun run test:security` ✅ (önceki durum: #102 `todo` işaretiyle CI'ı kırmıyor;
  bu PR'la ilgisiz)
- `tests/e2e/accessibility.spec.ts` ✅ 180 passed (dev sunucusu, 3 worker)
- `tests/e2e/typography.spec.ts` + `responsive-locales.spec.ts` ✅ 48 passed

### Sahibin yapması gerekenler / notlar

- **#95 kapatılabilir:** spec zaten rota düzeyinde bölünmüş durumda (`main`).
- **#144 bu PR'la çözülür:** dil menüsü artık hedef dilin slug'ını kullanıyor.
- **#102 (`unsubscribe-token-core.ts` `server-only` eksik)** hâlâ açık ve
  LANE-URUN'un dosyası; `tests/security/client-boundary.test.ts` onu `todo` olarak
  işaretliyor, CI kırmızı değil.
- `src/styles/global.css` hâlâ sahiplik tablosunda yok (önceki turlardan not).
- Değişen dosyalar: `src/components/layout/site-header.tsx`,
  `src/components/layout/language-links.ts`, `src/components/layout/language-links.test.ts`,
  `tests/e2e/accessibility.spec.ts`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 4)

Branch: `lane/tasarim`. Taban: `origin/main` @ `6228499`. Kuyrukta `agent:frontend`
+ `lane:tasarim` etiketli tek iş **#191** (marka paleti) idi; #220 `lane:urun`.

### #191 — durum: sahiplik çelişkisi çözülene kadar e-posta tarafı devredildi

#191 iki dosyayı (`supabase/functions/_shared/email-layout.ts`, `email-render.ts`)
LANE-URUN'a veriyor ama sahiplik tablosu + `scripts/lane-collisions.mjs` `supabase/**`
altını **LANE-SUPABASE**'e veriyor (önceki turda bu çelişki zaten rapor edildi).
Kural katı: sahibi olmadığım dosyaya yazmam. Bu yüzden:

- **Site tarafını yaptım** (benim: `src/styles/global.css` + guard'ım): marka
  token'ları artık guard'lı (aşağıda Bulgu 4).
- **E-posta tarafı** zaten `lane:urun` + `agent:handoff` etiketli #191'de duruyor;
  yeni issue açmadım (kopya olurdu), #191'e kanıt + AA uyarısı yorumu bıraktım.
  Uyarı: issue'nun önerdiği `inkSoft → --color-vanadium-500 (#707875)` eşlemesi
  **WCAG AA'yı düşürür** (crayon-50 üzerinde 4.05:1 < 4.5:1); site tarafında
  ikincil metin `--ink-4 = --color-vanadium-600 (#555d5a)` (6.06:1) kullanıyor.
  Ayrıca `supabase/**` sahipliği LANE-SUPABASE'de olduğu için o dosyalara yazacak
  lane'in netleşmesi gerekiyor.

### Bulgu 3 — Reduced-motion reseti gecikmeyi sıfırlamıyordu; hero başlığı boş kalıyordu (düzeltildi)

- **Belirti:** `prefers-reduced-motion: reduce` altında ana sayfa hero başlığının
  satırları (`.hero-title-line`, `.hero-title-accent`) boyanın ardından **0.16s /
  0.28s boyunca `opacity: 0`** kalıyordu.
- **Kök neden:** `src/styles/global.css:1360` global reseti
  `animation-duration: 0.01ms !important` yazıyor ama **`animation-delay`'e
  dokunmuyor**. `@keyframes hero-copy-enter` `from { opacity: 0 }` ile başlıyor ve
  kural `backwards` dolgu kullanıyor; dolayısıyla gecikme boyunca başlangıç karesi
  (görünmez) tutuluyor. `:1721`'deki yorum ise "global reduced-motion kuralı
  tümünü doğrudan son duruma indirir" diyor — bu **yanlıştı**; sıfırlanan süre
  gecikmeyi atlamıyor, yalnızca ondan *sonraki* hareketi yok ediyor. Aynı boşluk
  `transition-delay` için de var.
- **Ölçüm (yerel dev, Chromium 155, `reducedMotion: reduce`):** düzeltmeden önce
  `getComputedStyle(...).animationDelay` = `0.16s`/`0.28s`, `opacity` = `0`;
  düzeltmeden sonra `0s`, `opacity` = `1`.
- **Düzeltme:** global reseti `animation-delay: 0s !important` ve
  `transition-delay: 0s !important` ile tamamla.
- **Kanıt (piksel, `deviceScaleFactor: 2`, sharp diff):** oturmuş durumda (reduced
  değil) hero öncesi↔sonrası **0/3230720 px** değişti, maxDelta 1 — normal
  hareket hiç etkilenmedi; fark yalnızca reduced-motion ilk karede.
- **Guard:** `tests/unit/design-tokens.test.ts` — "the reduced-motion reset zeroes
  animation and transition delays": `prefers-reduced-motion` bloğunu çözer ve dört
  özelliğin de sıfırlandığını şart koşar. Negatif test edildi (iki satır çıkarılınca
  kırmızı).

### Bulgu 4 — Marka alias'ları (`--green` vb.) hiçbir guard'da değildi (düzeltildi)

- **Belirti:** `--green` (105 yerde `var(--green)`), `--green-hover/deep/mid/soft/…`,
  `--ink*`, `--line` alias'ları bir palet çapasına çözülüyor ama hiçbir test bunu
  doğrulamıyordu. Çapalar (`--color-shade-green-800` vb.) guard'lı; alias'lar değil.
- **Etki:** `--green` başka bir shade'e çevrilse marka rengi tüm sitede değişir,
  `check:frontend-source` ve `test:unit` **yeşil kalır** (ölçüldü).
- **Düzeltme:** "the semantic brand aliases resolve to their documented palette
  anchors" testi eklendi; 12 alias'ı çapasına bağlar. Negatif test edildi
  (`--green` → `shade-green-500` yapılınca kırmızı).
- **Neden bu #191'in konusu:** #191'de e-posta kabuğu "matches the app's `--green`
  token" yorumu taşıyor ama değer uyuşmuyor — alias'ın sessizce kayabileceği tam
  da bu sınıf. Guard, aynı hatanın site tarafında tekrarlanmasını engelliyor.

### Micro-denetim (bu tur)

- **Envanter:** `git ls-files 'src/components/**' 'src/experience/**' 'src/styles/**'`
  → 56 dosya. Önceki turlarda denetlenenler dışında bu turda:
- **Etkileşimli durumlar axe ile tarandı** (guard'ın görmediği haller): mobil menü
  açık, sektör dizini açık, consent kartı, consent politika paneli, dil menüsü açık
  — 6 dil × mobil. **0 ihlal.**
- **Dokunma hedefi taraması:** 18 public rota × 3 dil (tr/de/fa), mobil 390px —
  24px altı kontrol avı. Bulunanlar yalnızca **satır içi metin linkleri** (ör.
  `editorial-text-link` 190×18), ki WCAG 2.5.8 istisnası (satır içi) kapsamında;
  buton/kontrol hedefleri ≥44px. İhlal yok.
- **320px yatay taşma:** 18 rota × 6 dil, `documentElement.scrollWidth` ölçümü —
  **0 taşma.**
- **Kontrast:** yeni ham hex yok; alias/çapa testi eklendi.
- **RTL:** `html[dir=rtl]` girdi yönü kuralları ve mantıksal özellikler yerinde;
  `fa` axe taraması temiz.
- `autoAlpha` (yasak) yok; `visibility: hidden` yalnızca dekoratif bir yerde.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (501 test, +2 yeni guard)
- `tests/e2e/home.spec.ts -g reduced-motion` ✅ 1 passed
- `tests/e2e/accessibility.spec.ts` + `typography.spec.ts -g home` ✅ 9 passed

### Sahibin yapması gerekenler

- **#191 e-posta tarafı** → zaten `lane:urun` + `agent:handoff` etiketli; #191'e
  kanıt + AA uyarısı yorumu bırakıldı. Önce hangi lane'in `supabase/**` altına
  yazacağı netleşmeli (tablo LANE-SUPABASE diyor, issue LANE-URUN diyor).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 5)

Branch: `lane/tasarim`. Taban: `origin/main` @ `510ebac`. Kuyrukta `lane:tasarim`
etiketli tek iş **#191** idi; e-posta tarafı sahiplik çelişkisi yüzünden hâlâ
devirde (tur 4 notu). Bu turda brief'in 2. maddesi (**RTL**) alanı tarandı ve
somut bir kusur sınıfı bulundu.

### Bulgu 5 — Yön duyarlı bildirimler fiziksel `left/right` kullanıyordu; `fa` aynalanmıyordu (düzeltildi)

- **Belirti:** `dir="rtl"` altında (Farsça) bir dizi bildirim yönü takip etmiyordu:
  - `.sector-card { text-align: left }` → kart metni sağa hizalı kutunun **sol**
    kenarına yapışıyordu (ölçüm: `fa` kutu 211–360, metin 211–288; `tr`'de aynı
    kutu 31–179, metin 31–133 — yani RTL'de beklenen sağ kenar değil).
  - `.mobile-nav a/button { text-align: left }` → menü etiketleri sol kenarda.
  - `.editorial-page-scene-copy` (+ `h2`, `p`) `text-align: left` → giriş/kayıt
    sayfasındaki sahne metni sağa hizalı panelde sola kaçıyordu.
  - `.sector-heading { padding-left; border-left }` → yeşil şerit ve girinti
    RTL'de yanlış tarafta.
  - `.about-hero-aside/.blog-hero-aside { padding-left; border-left }` → ayırıcı
    çizgi yanlış tarafta.
  - `.editorial-password-field > input { padding-right: 48px }` → şifre göster
    düğmesinin yeri RTL'de ters; metin ile düğme çakışma riski.
  - `.company-directory-select select { padding-right: 34px }` → seçim oku yeri.
  - `.candidate-signout { text-align: right }` ve `.vend-panel-price span`
    (fiyat etiketi) → `end` olmalı.
  - Header'da `margin-left: auto/clamp(...)` (`.desktop-nav`, `.header-actions`,
    `.workspace-status`) → RTL'de boşluk yanlış tarafa itiliyordu.
  - **Asimetrik 4-değerli kısayollar:** `.sector-card-copy`
    (`padding: 13px 14px 13px 15px`, mobilde `10px 23px 3px 25px`) ve
    `.text-action` (`8px 0 8px 10px`) — ikinci/dördüncü değerler fiziksel sağ/sol
    olduğu için aynalanmıyordu.
- **Kök neden:** bu bildirimler **fiziksel** (`left`/`right`); `dir=rtl` altında
  aynalanmazlar. Repo zaten `margin-inline`/`padding-inline` ağırlıklı (50+ kullanım),
  yani fiziksel biçim istisnaydı.
- **Düzeltme:** yön duyarlı olanlar mantıksal karşılıklarına çevrildi
  (`text-align: start/end`, `margin-inline-start`, `padding-inline-start/end`,
  `border-inline-start/end`, `border-inline`, `padding-inline`); asimetrik
  kısayollar `padding-block` + `padding-inline` çiftine ayrıldı. Yalnızca
  `html[dir="rtl"]` override'ındaki bilinçli fiziksel değer korundu.
- **Kanıt (piksel, 8 rota × tr/fa, `deviceScaleFactor: 1`, sharp diff):**
  - **LTR (`tr`) öncesi↔sonrası: 0/9216000 px (0.00%), maxDelta ≤5** → LTR hiç
    etkilenmedi (fiziksel == mantıksal orada).
  - **RTL (`fa`) öncesi↔sonrası: ~174094/9216000 px (%1.89)** → düzeltme yalnızca
    `fa`'yı hareket ettirdi; beklenen sonuç.
  - Ölçüm (örnek, mobil 390px): `.sector-card-copy` metni `fa`'da kutunun sağ
    kenarından **10px** içeride (LTR'de sol kenardan 10px) — ayna simetrik;
    `.editorial-page-scene-copy h2` `fa` kutu sağ kenarına yapışıyor.
- **Guard:** `tests/unit/design-tokens.test.ts` — "direction-sensitive
  declarations use logical properties": yorumları ve `html[dir="rtl"]` /
  `html:dir(rtl)` bloklarını çıkarıp (a) `margin/padding/border-left|right` ve
  `text-align: left|right` kalıbını, (b) yatay çifti farklı 4-değerli
  `margin`/`padding` kısayolunu arar; ikisi de sıfır olmalı. `clamp()` ve
  `!important` doğru ayrıştırılır. Negatif test edildi (her iki biçim geri
  konunca kırmızı; simetrik `padding: 10px 22px` yeşil kalır).

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (511 test, +1 yeni guard)
- `tests/e2e/accessibility.spec.ts -g "fa "` ✅ 40 passed
- `tests/e2e/typography.spec.ts` + `responsive-locales.spec.ts` ✅ 48 passed

### Sahibin yapması gerekenler

- **LANE-QA / #210:** `tests/visual/baselines/header-fa.png` ve
  `home-search-fa.png` bu düzeltmeyle **meşru olarak** değişti (RTL artık doğru
  aynalanıyor). Baseline'lar runner ortamında yenilenirken bu düzeltme dahil
  edilmeli; görsel adım `continue-on-error` olduğu için CI'ı kırmaz.
- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` devrinde (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 6)

Branch: `lane/tasarim`. Taban: `origin/main` @ `dcdbfa3`. Kuyrukta `lane:tasarim`
etiketli tek iş **#191** idi (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'in 3 ve 5. maddeleri (klavye/odak, 3D graceful degradation) ve 4.
maddesinin *animasyon ortası kontrast* kısmı tarandı.

### Bulgu 6 — Sektör dizini paneli `opacity: 0`'dan beliriyordu; metin animasyon ortasında AA altına düşüyordu (düzeltildi)

- **Belirti:** `/` ana sayfada "Tüm çalışma alanları" düğmesine basınca açılan
  `.sector-directory-panel` 300ms boyunca `opacity: 0 → 1` ile beliriyordu. Panel
  16 sektör kartının metnini taşıyor.
- **Ölçüm (yerel dev, Chromium 155, mobil 390px):** panel açılırken
  `getComputedStyle(explorer).opacity` sırasıyla
  `0, 0.397, 0.681, 0.827, …`. `opacity 0.397`'de kart metni (`strong` rengi
  `#0d211b`, kart yüzeyi `--surface`) arkadaki sayfaya doğru kompozitlenince
  ölçülen kontrast **2.43:1** — AA (4.5:1) altı. Oturmuş durumda 15.8:1.
- **Kök neden:** `@keyframes sector-disclosure-enter` `opacity: 0`'dan başlıyor.
  Bu tam da daha önce `editorial-page-enter`, `consent-card-in` ve
  `packages-rise-in` için düzeltilen sınıf.
- **Neden hiçbir guard görmedi:** axe guard'ı (`tests/e2e/accessibility.spec.ts`)
  sektör dizinini **hiç açmıyor**; panel hep `hidden`. Yani ihlal taramanın
  dışında kalıyordu.
- **Düzeltme:** keyframe'den `opacity` kaldırıldı; panel artık yalnızca
  `translateY(-6px) → 0` ile tam opak kayıyor (diğer üç keyframe ile aynı kural).
- **Kanıt (piksel/geometri):** panel açıkken oturmuş durumda öncesi↔sonrası
  **geometri birebir aynı** — panel 1149×1303 @ top 542, ilk kart 261×256 @
  (97, 776), 16 kart, `opacity: 1`. (Ham piksel diff bu panelde güvenilmez: sektör
  fotoğrafları geç çözülüyor ve GSAP reveal/tilt katmanı çalışıyor; iki **özdeş**
  çekim bile %7.5 farklıydı, bu yüzden deterministik geometri + computed opacity
  ölçüldü.)
- **Animasyon ortası kanıtı:** düzeltmeden sonra panel açılırken opacity hep `1`
  (`["1","1",…]`), yani kontrast baştan oturmuş değerde.
- **Guard:** mevcut "card entrance animations never fade opacity under AA-fragile
  labels" testine `.sector-directory-panel:not([hidden]) .sector-explorer` eklendi.
  `ruleBody` yardımcısı artık regex metakarakterlerini kaçırıyor (`:not([hidden])`
  gibi seçiciler daha önce eşleşmiyordu). Negatif test edildi (opacity geri
  konunca kırmızı).

### Micro-denetim (bu tur)

- **Etkileşimli durumlar axe ile tarandı** (guard'ın açmadığı haller): mobil menü
  açık, sektör dizini açık, consent kartı + politika paneli, dil menüsü açık —
  6 dil × mobil. **0 ihlal.**
- **Klavye/odak taraması:** ana sayfada 24 durak Tab ile gezildi; hepsinde görünür
  odak halkası (`outline: solid 2-3px`) ve dokunma hedefi ≥44px. Odak tuzağı,
  negatif tabindex, `aria-hidden` içinde odaklanabilir öğe yok.
- **Dokunma hedefi:** 18 rota × 3 dil, 390px → 24px altı yalnızca satır içi metin
  linkleri (WCAG 2.5.8 istisnası).
- **Yinelenen `id` / boş erişilebilir ad:** 18 rota × 6 dil → **0 bulgu**.
- **3D graceful degradation (brief 5):** WebGL `getContext` engellenerek test
  edildi → `packages-vend-fallback` mesajı + 4 yedek kontrol görünüyor, 0 canvas,
  **0 sayfa hatası**, fiyat paneli hâlâ erişilebilir. Sağlam.
- **Ölü kod:** `card-in`, `fade-in`, `modal-in`, `toast-in` keyframe'lerinin
  kullanıcısı yok (`card-in` yalnızca hiçbir bileşenin basmadığı `.job-card`'a
  bağlı). Ölü CSS temizliği ayrı bir iş; bu PR'a alınmadı (davranış değişmez).
- `autoAlpha` (yasak) yok.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (551 test, guard genişletildi)
- `tests/e2e/accessibility.spec.ts -g home` ✅ 9 passed
- `tests/e2e/home.spec.ts` (sector/home) ✅ 22 passed; 1 mevcut veri-bağımlı test
  (`anonymous visitors can search job previews…`) temiz tabanda da düşüyor —
  bu PR'la ilgisiz.

### Sahibin yapması gerekenler

- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.
