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

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 7)

Branch: `lane/tasarim`. Taban: `origin/main` @ `c4fb2e4`. Kuyrukta `lane:tasarim`
etiketli tek iş yine **#191** (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'in 2. (RTL) ve 3. (klavye/odak) maddeleri ile 4. maddesinin
LCP/CLS kısmı tarandı.

### Bulgu 7 — "Geri" okları ve mobil menü okları RTL'de aynalanmıyordu (düzeltildi)

- **Belirti:** `dir="rtl"` altında geri-navigasyon okları hâlâ sola bakıyordu.
  Geri bağlantısı LTR'de sola, RTL'de **sağa** bakmalı.
- **Kanıt (piksel, glif karşılaştırması):** `.editorial-back-link svg` glifi
  `fa`'da `tr` ile **birebir aynı** (mirror diff 77522 > direct diff 59694) —
  yani aynalanmamış. Düzeltmeden sonra `fa` glifi `rotate(180deg)`
  (`matrix(-1,0,0,-1,0,0)`) alıyor.
- **Etkilenenler (6 seçici):** `.editorial-back-link`, `.job-detail-back`,
  `.legal-page-back a`, `.vend-panel-back` (geri okları) ve `.mobile-nav a` /
  `.mobile-nav-primary` (ileri ok — mobil menü satır sonu).
- **Kök neden:** repo yönlü okları zaten aynalıyor
  (`html[dir="rtl"] .home-job-search-pagination svg`,
  `.home-journey-link svg`, `html:dir(rtl) .company-workspace-action-link > svg`),
  ama bu altı seçici hiç eklenmemişti.
- **Düzeltme:** `src/styles/global.css` — tek bir `html[dir="rtl"]` kuralında
  altı seçicinin `svg`'si `rotate(180deg)`.
- **Kanıt (piksel, 7 rota × tr/fa, DPR 1, sharp diff):**
  - **LTR (`tr`) öncesi↔sonrası: 0/8064000 px (%0.00), maxDelta ≤1** → LTR hiç
    etkilenmedi.
  - **RTL (`fa`):** sayfa başına yalnızca ~48-56 px (glifin kendisi) değişti.
- **Guard:** `tests/unit/design-tokens.test.ts` — "back-navigation and
  mobile-menu arrows mirror under RTL": altı seçicinin her biri için
  `html[dir="rtl"]` bloğunda `rotate(180deg)` şart koşar (virgüllü seçici
  listelerini de çözer). Negatif test edildi.

### Micro-denetim (bu tur)

- **CLS (brief 4):** 8 rota × 3 dil (tr/de/fa), mobil 390px — hepsi **< 0.1**
  hedefi içinde (en yüksek `fa/` 0.0859; dev sunucusu; overlay'ler dahil).
- **Canlı kontrast:** 15 public rota, masaüstü — düz renkli arka plan üzerindeki
  her metin **AA üstü** (foto-hero metni hariç; onu axe gerçek piksellerle
  tarıyor). Monogram tonları (`company-mark.ts`) beyaz baş harflerle en kötü
  **4.69:1**.
- **Vend paneli kapalıyken (`aria-hidden="true"`):** `visibility: hidden` sayesinde
  içindeki 5 kontrol Tab sırasına **girmiyor** (0 durak) — doğru.
- **Etkileşimli durumlar axe ile tarandı** (mobil menü açık, sektör dizini açık,
  consent kartı + politika paneli, dil menüsü açık) × 6 dil → **0 ihlal**.
- **Klavye/odak:** ana sayfada 24 durak; hepsinde görünür odak halkası, hedef
  ≥44px.
- **Yinelenen `id` / boş erişilebilir ad:** 18 rota × 6 dil → **0 bulgu**.
- **3D graceful degradation:** WebGL engellendi → yedek mesaj + 4 kontrol,
  0 canvas, 0 sayfa hatası.
- **Ölü kod (not):** `card-in`/`fade-in`/`modal-in`/`toast-in` keyframe'lerinin
  kullanıcısı yok (`.job-card` hiçbir bileşende basılmıyor). Ayrı iş; bu PR'a
  alınmadı.
- **Sandbox notu:** `NEXT_DIST_DIR` ile üretim standalone sunucusu bu turda
  chunk'ları 404 verdi (eksik `_next/static` kopyası); ölçümler **dev sunucusunda**
  yapıldı ve durum ayrıca `getComputedStyle` ile çapraz doğrulandı.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (567 test, +1 yeni guard)
- `tests/e2e/accessibility.spec.ts` + `responsive-locales.spec.ts` (fa/locale) ✅

### Sahibin yapması gerekenler

- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 8)

Branch: `lane/tasarim`. Taban: `origin/main` @ `f7a10fd`. Kuyrukta `lane:tasarim`
etiketli tek iş yine **#191** (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'te henüz taranmamış **WCAG 1.4.4 (200% zoom)** ve **1.4.12 (metin
aralığı)** boyutları ölçüldü.

### Bulgu 8 — Sektör/ilan başlıkları 1.4.12 metin aralığında kırpılıyordu (düzeltildi)

- **Belirti:** Kullanıcı satır aralığını 1.5, harf aralığını 0.12em, kelime
  aralığını 0.16em yaptığında (WCAG 1.4.12 bookmarklet değerleri) iki başlık
  taşmak yerine **kırpılıyordu**:
  - `.company-directory-card h2` → "Akacan International Univercity & Akacan
    British College" 54px'lik kutuda 81px gerektiriyordu (üçüncü satır gizli).
  - `.home-job-preview h4` → uzun ilan başlığı 45px'lik kutuda 68px gerektiriyordu.
- **Kök neden:** `-webkit-line-clamp: 2` (+ `display: -webkit-box; overflow:
  hidden`). Clamp büyümek yerine sessizce kırpar.
- **Neden hiçbir guard görmedi:** ne `check:frontend-source` ne axe 1.4.12'yi
  ölçüyordu; clamp varsayılan aralıkta zararsız (iki satıra sığıyor).
- **Düzeltme:** iki başlıktan da clamp kaldırıldı; başlık büyüyor. Kart düzeni
  güvenli: `.company-directory-card` `min-height: 330px` + flex column, aşırı uzun
  ad bile karta taşmıyor (ölçüldü: 71px başlık, kart 345px sabit).
- **Kanıt (piksel, `deviceScaleFactor: 2`, sharp diff):** varsayılan aralıkta
  öncesi↔sonrası **kart ızgarası 0/15152400 px**, **ilan önizleme ızgarası
  0/527360 px** — yani normal görünüm birebir aynı; değişiklik yalnızca 1.4.12
  koşulunda görünür.
- **Kanıt (1.4.12):** düzeltmeden sonra 3 rota × 3 dil (tr/de/fa) taramasında
  kırpılan clamp'li başlık **0**.
- **Guard:** `tests/unit/design-tokens.test.ts` — "clamped headings do not
  truncate (WCAG 1.4.12)": `.company-directory-card h2`, `.home-job-preview h4`
  ve `.jobs-card h3` için `-webkit-line-clamp` yasak. Negatif test edildi.
  (Gövde özetleri — `jobs-card-summary`, `company-workspace-preview-description`
  — kapsam dışı: oradaki clamp kasıtlı kısaltma, 1.4.12 paragrafın tamamını
  istemiyor.)

### Bulgu 9 (temiz) — 200% zoom taşma yok

- 15 public rota × 3 dil (tr/de/fa), 640px efektif viewport (1280px @ %200):
  **0 yatay taşma**. WCAG 1.4.4 karşılanıyor.

### Micro-denetim (bu tur)

- **1.4.12 metin aralığı:** 15 rota × 3 dil → tek kırpma sınıfı yukarıdaki iki
  başlık; düzeltildi.
- **1.4.4 zoom:** 45 kombinasyon → 0 taşma.
- Önceki turlardaki kontroller (etkileşimli durum axe taraması, klavye/odak,
  yinelenen id/boş ad, 3D graceful degradation, RTL okları) `main`'de yeşil.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (605 test, +1 yeni guard)
- `tests/e2e/company-directory.spec.ts` + `home.spec.ts` ✅

### Sahibin yapması gerekenler

- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 9)

Branch: `lane/tasarim`. Taban: `origin/main` @ `b8d730f`. Kuyrukta `lane:tasarim`
etiketli tek iş yine **#191** (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'in 2. (RTL) ve 3. (klavye/`aria-*`) maddeleri ile link bütünlüğü
tarandı.

### Bulgu 10 — Mantıksal boşluk rezervi + fiziksel konum: RTL'de ikon yanlış tarafta (düzeltildi)

- **Belirti (3 örnek, aynı sınıf):**
  - `.editorial-password-toggle` `right: 7px` iken girdi
    `padding-inline-end: 48px` rezerve ediyordu. RTL'de rezerv **sola** kayıyor,
    düğme **sağda** kalıyordu → düğme metnin üstüne biniyordu
    (ölçüm: `fa` düğme inline-start'tan 363px, rezerv inline-end'de).
  - `.candidate-privacy-card > svg` `left: 24px` iken kart
    `padding-inline-start: 55px` rezerve ediyordu → RTL'de ikon metinden uzak
    köşede (svg inline-start'tan 1237px).
  - `.language-menu` `right: 0` (mobilde `right: 16px`) iken RTL'de picker sol
    kenara yakın → menü **viewport'tan taşıyordu** (`menuL: -3`, `clipped: true`).
- **Kök neden:** rezerv mantıksal (`*-inline-*`), konum fiziksel (`left`/`right`);
  `dir=rtl`'de ikisi zıt yöne gidiyor.
- **Düzeltme:** üçü de mantıksal karşılığa çevrildi
  (`inset-inline-end: 7px`, `inset-inline-start: 24px`, `inset-inline-end: 0/16px`).
- **Kanıt (piksel, `deviceScaleFactor: 2`, sharp diff):**
  - Şifre alanı: LTR **0/83232 px**, RTL **%0.96** (düğme taşındı).
  - Dil menüsü: LTR **0/13024 px**, RTL **%19.3** (menü artık kırpılmıyor).
- **İşlevsel doğrulama:** şifre göster/gizle düğmesi `tr` ve `fa`'da
  `password → text` geçişini yapıyor; dil menüsü her iki yönde de viewport içinde.
- **Guard:** `tests/unit/design-tokens.test.ts` — "icons reserve their space on the
  same logical side under RTL": üç seçici için beklenen `inset-inline-*`
  özelliğini şart koşar ve fiziksel `left`/`right`'ı yasaklar. Üçü de ayrı ayrı
  negatif test edildi.

### Micro-denetim (bu tur)

- **`aria-*` kablolaması:** 13 public rota — `aria-labelledby`/`describedby`/
  `controls` hedefi olmayan id yok, `role=switch` `aria-checked`'siz değil,
  `aria-hidden` içinde odaklanabilir öğe yok → **0 bulgu**.
- **Link bütünlüğü:** 16 rota — `target="_blank"` dış linkler `noopener noreferrer`
  taşıyor, boş `href`, jenerik anchor metni, etiketsiz `mailto`/`tel` yok →
  **0 bulgu**.
- **Sektör araması:** Türkçe `toLocaleLowerCase("tr")` normalizasyonu tüm dillerde
  doğru (de/tr'de `IT`/`it`/`It` aynı sonucu veriyor).
- **Vend paneli klavyeyle:** 5 erişilebilir "twin" düğmesi; Enter ile panel
  açılıyor (`data-open`, `--vend-p: 1`). Kapalıyken `visibility: hidden` sayesinde
  Tab sırasına girmiyor.
- **Sektör dizini Escape ile kapanmıyor** (not): disclosure bir `<button
  aria-expanded>`; Escape desteği yok. Hata değil ama iyileştirme adayı — ayrı iş.
- Önceki turların kontrolleri `main`'de yeşil.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (625 test, +1 yeni guard)
- `tests/e2e/accessibility.spec.ts` (`fa`) + `packages.spec.ts` + `auth-flows.spec.ts` ✅

### Sahibin yapması gerekenler

- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 10)

Branch: `lane/tasarim`. Taban: `origin/main` @ `5b1923d`. Kuyrukta `lane:tasarim`
etiketli tek iş yine **#191** (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'in 3. (dokunma hedefleri ≥44px) ve `forced-colors`/`2.5.3` boyutları
tarandı.

### Bulgu 11 — Altı kontrol 44px dokunma hedefinin altındaydı (düzeltildi)

- **Belirti (390px, mobil):** `check:frontend-source`'un 44px kuralı yalnızca
  sabit bir seçici listesini ölçüyor; bu altısı listede değildi ve **34-40px**
  yüksekliğinde yayınlanmıştı:
  | Seçici | Önce | Sonra |
  |---|---|---|
  | `.consent-btn` (çerez diyaloğu) | 40px | **44px** |
  | `.company-directory-pagination button` | 38px | **44px** |
  | `.packages-vend-sound` | 40px | **44px** |
  | `.feedback-rating-star` | 40px | **44px** |
  | `.home-job-search-clear` | 38px | **44px** |
  | `.legal-page-back a` | 34px | **44px** |
- **Kök neden:** liste tabanlı gate; kapsam dışı kontroller sessizce kayabiliyor.
  Pagination'ın bir de **breakpoint override'ı** vardı (`min-height: 38px`), yani
  temel kuralı düzeltmek yetmiyordu.
- **Düzeltme:** altısı da `44px` tabanına çekildi (base + responsive override).
- **Doğrulama:** canlı ölçüm (`getBoundingClientRect`) altısında da **44px**.
  `.packages-vend-control-twin` 1×1 görsel olarak gizli ama `:focus-visible`'da
  **82×44**'e açılıyor — kasıtlı, değiştirilmedi.
- **Guard:** `tests/unit/design-tokens.test.ts` — "the fixed touch targets keep a
  44px effective floor": altı seçicinin **etkin** `min-height`/`height`'ını medya
  kaskadından çözer (390px'te), ≥44px şart koşar. Negatif test: hem temel kural
  hem de breakpoint override'ı ayrı ayrı geri alınıp kırmızı görüldü.

### Micro-denetim (bu tur)

- **`forced-colors: active`:** 10 rota × 2 dil axe ile tarandı — 20 `color-contrast`
  bulgusu **çıktı**, ama bunlar axe'ın bilinen sınırı: rapor ettiği renk
  **yazılı** renk (`#fffdf8`), tarayıcının zorladığı sistem rengi değil. Gerçek
  render ölçüldü (`getComputedStyle` → `rgb(0,0,159)`, piksel histogramı → koyu
  glifler açık zeminde, 4049 koyu / 20099 açık piksel): **metin okunur**. Karar:
  gerçek kusur yok; guard eklenmedi (yanlış-pozitif üretirdi).
- **WCAG 2.5.3 (Label in Name):** 16 public rota — `aria-label` taşıyan her
  etkileşimli öğenin erişilebilir adı görünen metnini içeriyor → **0 bulgu**.
- **`target-size` (axe):** ana sayfa mobil → 0 ihlal (2.5.8 zaten geçiyor; asıl
  açık projenin kendi 44px hedefiydi, yukarıda kapatıldı).
- Önceki turların kontrolleri `main`'de yeşil.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (632 test, +1 yeni guard)
- `tests/e2e/{consent,company-directory,packages,contact,accessibility}.spec.ts` ✅

### Sahibin yapması gerekenler

- **INFRA (öneri):** `check-frontend-source.mjs`'teki `touchTargetSelectors`
  listesine bu altı seçici eklenmeli; `scripts/**` INFRA'nın olduğu için
  dokunmadım. Guard şimdilik `tests/unit/design-tokens.test.ts`'te.
- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `docs/lanes/05-tasarim.md`. Hepsi bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-05, tur 11)

Branch: `lane/tasarim`. Taban: `origin/main` @ `1b1bf26`. Kuyrukta `lane:tasarim`
etiketli tek iş yine **#191** (e-posta tarafı sahiplik çelişkisinde, devirde). Bu
turda brief'in 2. (responsive) ve 3. (erişilebilirlik kapsamı) maddeleri ile
sınır girdiler tarandı.

### Bulgu 12 — axe guard'ı `/jobs/[slug]` (ilan detay) rotasını hiç taramıyordu (düzeltildi)

- **Belirti:** `tests/e2e/accessibility.spec.ts` `publicRoutes` listesi `/jobs`
  (liste) rotasını tarıyor ama **`/jobs/[slug]` (ilan detay)** hiç taranmıyordu.
  Detay rotası liste sayfasının göstermediği bölümleri basıyor: işveren kartı,
  olgu satırı ve `platform` ilanlarında **başvuru formu**.
- **Neden önemli:** iki başka spec (`jobs.spec.ts`, `seo.spec.ts`) bu rotaya
  güveniyor (`/tr/jobs/source-iskibris-garson`), yani rota CI'da canlı; ama
  erişilebilirlik guard'ı onu hiç görmüyordu. Başvuru formunda bir kontrast/hedef
  regresyonu kimse görmeden yayınlanabilirdi.
- **Düzeltme:** `publicRoutes`'a `{ path: "/jobs/source-iskibris-garson",
  name: "job-detail" }` eklendi. Slug, `seed-source-jobs.sql`'de gerçek bir
  `source_site` satırı (id `…0001`, başlık "Garson") ve iki spec'in zaten
  kullandığı slug. İçe aktarılan ilanlar her önek altında aynı Türkçe slug'ı
  taşıdığı için **tek slug altı dilin hepsini** kapsıyor.
- **Kapsam:** test sayısı **180 → 189** (+9: tr/en/ru/el/fa/de mobil + tr/de/fa
  masaüstü).
- **Doğrulama:** test koleksiyonu `--list` ile doğrulandı (`job-detail` ×9).
  Yerelde tohum (seed) verisi ve Docker olmadığı için koşulamadı; CI'da `db:start`
  tohumu yükler ve E2E ondan sonra koşar, yani rota deterministik.

### Micro-denetim (bu tur)

- **Yatay/dikey döndürme (landscape 844×390):** 7 public rota → **0 yatay taşma**;
  çerez kartı header'ı örtmüyor.
- **Sınır girdiler (uzun/unicode):** `.sector-card-copy`, `.home-journey-link`,
  `.language-option` içine uzun Türkçe ad, tekrarlı çok uzun kelime ve emoji
  dizisi enjekte edildi → **0 taşma**, eleman kabından taşmıyor.
- **Vend sahnesi durum makinesi:** aç → teslim → kapat → yeniden aç döngüsü 3
  kez, her tier için doğru `data-selected-package` + panel başlığı; **0 sayfa
  hatası**. Panel açıkken farklı bir tier düğmesine basmak seçimi değiştirmiyor —
  bu `timeline.ts` `press()`'in kasıtlı davranışı (yalnızca `idle` fazında kabul
  eder), hata değil.
- **`aria-label`'lı geri bildirim yıldızları** (`src/features/feedback/**`,
  LANE-URUN) doğru `ratingValue` etiketi taşıyor.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (660 test)
- `tests/e2e/accessibility.spec.ts --list` ✅ 189 test (job-detail ×9 dahil)

### Sahibin yapması gerekenler

- **LANE-QA → #349:** `home-search` baseline'ı 44px düzeltmesinden dolayı hâlâ
  yenilenmeli (tur 10 devri).
- **#191 e-posta tarafı** hâlâ `lane:urun` + `agent:handoff` (tur 4).
- Değişen dosyalar: `tests/e2e/accessibility.spec.ts`,
  `docs/lanes/05-tasarim.md`. İkisi de bu lane'in kapsamında.

---

### Tur — `/fa` rakam sızıntısı: vend paneli + sektör keşfi (PR #383, 2026-11-06)

**Kapsam.** Atanmış `lane:tasarim` handoff issue'su **#361** alındı. Kanıt
doğrulandı (canlı `/fa` render'ında sektör keşif yüzeyi Latin rakam gösteriyordu)
ve yalnızca sektörle sınırlı olmadığı görüldü: **vend paneli** de aynı sınıfı
taşıyordu.

**Kök neden (üç ayrı yer, tek sınıf).**

1. `Panel.tsx` fiyatı sabit `"tr-TR"` ile biçimlendiriyordu → `/fa`'da `₺1.290`,
   hemen yanında `TRY ۱٬۲۹۰` (aynı ekranda iki rakam sistemi).
2. `Panel.tsx` adım işaretleri `` `0${index+1}` `` ile Latin `01` üretiyordu.
3. `labels.ts` kanvas raf adedi düz `${p.listingCount}` ile çiziliyordu.
4. `sector-explorer.tsx` / `home-experience.tsx` çeviriyi **dize** ile çağırıp
   `.replace("{count}", String(n))` yapıyordu → ICU sayıyı hiç görmüyordu, bu
   yüzden `fa.json` anahtarları `{count, number}` yapılamıyordu (#361'in özü).

**Çözüm.** Sayfayı `locale` ile besle; fiyat/adım/raf adedini `Intl.NumberFormat`,
sayaçları `next-intl` `useFormatter().number()` ve `t(k, { count: n })` ile üret.
Sektör tarafında ICU artık gerçek `number` görüyor, katalog anahtarları
tiplenebilir hâle geldi.

**Kanıt (canlı `/fa`, üretim standalone build + gerçek tarayıcı DOM).**

| Yüzey | Önce | Sonra |
|---|---|---|
| vend fiyat | `₺1.290` | `₺۱٬۲۹۰` |
| vend adım | `01` | `۰۱` |
| dizin rozeti | `16` | `۱۶` |
| toplam `<strong>` | `16` | `۱۶` |
| filtre çipi | `16` | `۱۶` |
| `tr` | `2.790` / `16` | değişmedi |

**Mikro-denetim (AUDIT.md).** Sahip olunan alan `git ls-files` ile **63 dosya**;
bu turda **8**'i satır satır incelendi (6 değişen + 2 yeni test), **55**'i
rakam/locale, RTL, `target=_blank`, ham hex, `aria-label`↔görünen metin,
`prefers-reduced-motion` kalıplarıyla tarandı, **bakılmayan 0**. 7 bulgu:
5 düzeltildi, 1 devredildi (#385), 1 bilinçli bırakıldı (`toLocaleLowerCase("tr")`
— arama terimleri ASCII, `i/ı` eşlemesi `tr` gerektiriyor).

**Devirler.**

- **#384 → LANE-İÇERİK:** `fa.json` `HomePage.{sectorTotalCount,
  sectorResultCountSingular, sectorResultCountPlural}` hâlâ çıplak `{count}`.
  Kod hazır; üç anahtar `{count, number}` yapılıp `FA_DEFERRED_PLACEHOLDERS`
  muafiyeti kalkınca `/fa` sonuç satırı ve `aria-label` da Farsça olur.
- **#385 → LANE-INFRA:** `scripts/check-frontend-source.mjs` hâlâ eski
  `quoteEmailBody.replace("%DAYS%", String(selectedDuration))` satırını birebir
  pinliyor; yerel-farkında biçim doğru düzeltmeyi engelliyor. Gate hizalanınca
  `Panel.tsx:60` tekrar düzeltilecek (`/fa` teklif e-postası `۳۰`).

**Çalıştırılan kontroller.**

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ (689 test)
- `tests/e2e/accessibility.spec.ts` ✅ 189/189 (tüm 6 dil, üretim standalone)
- CI (PR #383) ✅ — Static, Database, E2E 1–4, "Quality, database and E2E"

**Sahibin yapması gerekenler.** #384 (LANE-İÇERİK), #385 (LANE-INFRA).

**Sonraki lane için notlar.**

- Kalan iki Latin dize (#384) çözülünce `/fa` sektör yüzeyi tamamen Farsça olur;
  PR #383 bunun **kod** yarısını kapatıyor.
- `/fa`'da Latin rakam ararken yalnızca görünen metne bakma: `aria-label`
  içindeki sayı da bir yüzeydir (bu turda `sector-explorer-total` öyle yakalandı).
- `scripts/check-frontend-source.mjs` "kaynak birebir şu satırı içermeli" biçiminde
  pin yapıyor; bu satırı meşru biçimde değiştiren bir düzeltme gate'i kırar —
  önce gate'i güncelleyecek lane'e devret (#385).

---

## LANE-TASARIM çalışma notları (2026-11-06, tur 12)

Branch: `lane/tasarim`. Taban: `origin/main` @ `732d8ea`. Kuyrukta `agent:frontend`
etiketli açık issue yok (üç açık issue başka lane'lerin). Bu yüzden brief'in 3.
(erişilebilirlik) ve RTL/rakam maddelerinden en yüksek etkili iki bulgu seçildi;
ikisi de **dekoratif sayı yüzeyi**nin `/fa`'da Latin rakam basmasıydı — LANE-İÇERİK'in
ICU sayaçları için kapattığı sınıfın (#360/#391) ICU'dan geçmeyen iki örneği.

### Bulgu 13 — Yolculuk kartı adım işaretleri `/fa`'da Latin rakam basıyordu (düzeltildi)

- **Belirti:** canlı `isbulkktc.com/fa` → `home-journey-step-number" aria-hidden="true">0<!-- -->1`.
  İki kartın üçer adımı `01 02 03` gösteriyordu; Farsça metnin yanında yabancı sızıntı.
- **Kök neden:** `home-journeys.tsx` işareti `0{index + 1}` **dize sabitiyle**
  kuruyordu. `Intl`/ICU hiçbir yerinden geçmediği için yerel-farkında biçimlendirici
  yakalayamaz — bu yüzden `fa.json` tiplenmiş olsa bile (#391) bu iki yüzey Latin kaldı.
- **Düzeltme:** `formatStepNumber(locale, index)` (`Intl.NumberFormat(locale,
  { minimumIntegerDigits: 2, useGrouping: false })`) eklendi; iki çağrı yeri
  (satır ~66, ~116) ondan geçiyor. `fa` → `۰۱ ۰۲ ۰۳`, Latin diller `01` kalır.
- **Kanıt:** üretim standalone build'de `/fa` `۰۱/۰۲/۰۳`, `tr/de/…` `01/02/03`.

### Bulgu 14 — PWA kurulum adım rozeti her dilde ASCII rakam (düzeltildi)

- **Belirti:** `.pwa-install-steps > li::before` kuralı `content: counter(pwa-step)`.
  Çıplak `counter()` **her zaman** ASCII rakam basar, `lang`/`dir` ne olursa olsun;
  `/fa` kurulum rehberi adımları `1 2 3` gösteriyordu.
- **Düzeltme:** `html[lang="fa"] .pwa-install-steps > li::before { content: counter(pwa-step, persian) }`
  geçersiz kılması. Numaralandırma sistemi **dile** bağlı, yöne değil — JS
  tarafındaki `Intl.NumberFormat(locale)` ile aynı eksen. `dir` yerine `lang` seçildi
  çünkü `tr`/`en`/… de RTL olmayan ama Farsça olmayan dilleri ayırmak gerekir.
- **Kanıt:** üretilen CSS'te `html[lang=fa] .pwa-install-steps>li:before{content:counter(pwa-step, persian)}`;
  Chromium'da (`deviceScaleFactor: 3`) `۱` genişliği `7.94px`, ASCII `1` `9.05px` — farklı rasterize.

### Micro-denetim (bu tur, AUDIT.md)

- **Envanter:** `git ls-files 'src/components/**' 'src/experience/**' 'src/styles/**'
  'src/assets/**'` → **63 dosya** (60 üretim + 3 test). **Bakılmayan 0.**
- **Tarama desenleri (0 bulgu):** `target="_blank"` (tek yer `site-footer.tsx`,
  `rel="noopener noreferrer me"` ✅), brace-aware `<button>` `type` (0 eksik ✅),
  `<img>/<Image>` `alt` (0 eksik ✅), `tabIndex={1..}` (0 ✅), hardcoded
  `Intl.*('tr'|'en'|…)` (0 ✅), fiziksel `margin/padding-left|right` (0 ✅),
  `<a>` `href`'siz (0 ✅), iç içe etkileşimli `<a><button>` (0 ✅), yinelenen statik
  `id` (0 ✅), `aria-hidden="true"` içinde odaklanabilir öğe (0 ✅ — grep yalnız
  ikonu işaretliyor, sarmalayıcı link değil).
- **Rakam yüzeyi taraması:** `<ol>/<ul>` sayaçlarının tamamı tarandı; tek `counter()`
  Bulgu 14'tü. `format.number()`/`Intl.NumberFormat` geçen yüzeyler zaten yerel.

### Devir

- **#385 → LANE-INFRA (açık, `lane:infra`, `agent:handoff`):** `scripts/check-frontend-source.mjs:623`
  hâlâ `quoteEmailBody.replace("%DAYS%", String(selectedDuration))` satırını birebir
  pinliyor; bu yüzden `src/experience/scenes/vend-pricing/components/Panel.tsx:60`
  yerel-farkında biçime geçemiyor (`/fa` teklif e-postası `۳۰` olmalı). Benim
  dosyam değil, dokunmadım. #385 merge olunca Panel.tsx düzeltilecek.
- **#361 doğrulandı, kapalı:** PR #383 + #391 ile `fa.json` `{count, number}`
  tiplendi; canlı `/fa` `…: ۱۶` gösteriyor. Ek iş yok.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅ (41 token, kontrast+motion)
- `bun run test:unit` ✅ **703 pass / 0 fail**
- CI (PR #395) ✅ — Static, Database, E2E 1–4, "Quality, database and E2E" (10/10 yeşil)

**Negatif test:** her iki düzeltme geri alınınca ilgili guard kırmızı düştü
(`home-journeys.test.ts` ratchet FAIL; `design-tokens.test.ts` 14 pass/1 fail).

**Sahibin yapması gerekenler.** #385 (LANE-INFRA) merge → sonra LANE-TASARIM
`Panel.tsx:60`'ı `Intl.NumberFormat`'a çevirir.

**Sonraki lane için notlar.**

- Dekoratif ama **görünen** sayılar bir yüzeydir: `0{index+1}` gibi dize sabitleri
  ve çıplak CSS `counter()` ICU'dan geçmez, `lang` değişse de Latin kalır. Yeni
  sayaç/işaret eklerken `Intl.NumberFormat(locale)` veya `counter(x, <style>)` kullan.
- CSS numaralandırma sistemini **`lang`'a** bağla, `dir`'a değil: RTL ile Farsça
  aynı küme değil (`ar`/`he` RTL ama Latin rakam kullanır).

---

## LANE-TASARIM çalışma notları (2026-11-06, tur 13)

Branch: `lane/tasarim`. Karşılaştırma tabanı: `origin/main` @ `3f5a654`.

Kuyrukta `lane:tasarim` etiketli üç issue vardı (#436, #361, #191). #361 zaten
`main`'de çözülmüş (#383/#391 — `sector-explorer.tsx` artık gerçek `number`
geçiyor, `fa.json` üç anahtarı `{count, number}` yapmış); yalnız kalan ertelenmiş
dize yolu yorumu ve testteki geçici `fa` yaması temizlendi. #191 (e-posta paleti)
LANE-URUN/İÇERİK dosyalarında, bana devredilecek bir şey yok. Bu turun asıl işi
**dokunma hedefi (44px) süpürmesi** ve **#436'nın kök neden analizi** oldu.

### Bulgu 1 — 12 etkileşimli kontrol 44px tabanının altındaydı (düzeltildi)

- **Belirti:** `src/styles/global.css`'te metin-stilli (yalnız `padding` ile
  boyutlanan) kontroller 24–40px yüksekliğindeydi. WCAG 2.5.8 (target-size) ve
  lane brief'inin "dokunma hedefleri ≥44px" kuralı ihlali.
- **Düzeltme:** 12 seçiciye `min-height: 44px` (+ gereken yerde
  `display: inline-flex; align-items: center`) verildi: `.sector-search-clear`,
  `.sector-filters-reset`, `.jobs-clear-link`, `.packages-hero-link`,
  `.footer-social-link`, `.consent-policy-link`, `.consent-close`,
  `.pwa-push-signin`, `.sector-explorer-empty button`, `.vend-panel-duration button`,
  `.vend-panel-back`, `.pwa-update-primary/secondary`.
- **Kanıt (üretim standalone build, `127.0.0.1:3300`):** `playwright-core` ile
  mobil (390×844) ölçüm — `.sector-search-clear` 44×44, `.sector-filters-reset`
  73×44, `.jobs-clear-link` 68×44, `.packages-hero-link` 155×44,
  `.consent-policy-link` 78×44, `.consent-btn` 350×44. DOM'da ulaşılamayan
  durumlar (consent close, pwa sign-in, footer social) gerçek stil sayfası enjekte
  edilerek ölçüldü: hepsi 44px.
- **Yerleşim etkisi sınırlı:** consent kartı 24px büyüdü (582→606px), kırpma yok;
  320/360/390px'te yatay taşma 0.

### Bulgu 2 — `editorial-page-scene-video-controls` 31px; yükseltme metni kapatıyor (devredildi)

- **Gözlem:** auth sayfalarındaki video kontrol düğmeleri 31px. 44px'e çıkarınca
  üstteki `.editorial-page-scene-copy` kartıyla **6px** (390px) / **11px**
  (1280px) yeni örtüşme oluşuyor; tablet genişliklerinde (768/900px) örtüşme
  **kartın metnini** kapatıyor (`coversText: true`).
- **Karar:** Bu bir düzen yeniden tasarımı gerektirir (sahne yüksekliği +
  kontrol/ kopya konumu birlikte), sınırlı bir "boyut" düzeltmesi değil. Geri
  alındı, guard'a eklenmedi; ölçümle birlikte not edildi.

### Bulgu 3 — #436: ilçe görselleri "1.9 MB, yalnız Girne görünüyor" iddiası (kanıt)

- **Kaynak vs sunulan:** `Girne.webp` diskte 1916 KB (3840×2500), ama Next.js
  `_next/image` ile servis edilen hâli **128 KB** (390px genişlik, `quality=90`).
  Ölçüm: mobil anasayfada hero'nun servis ettiği 6 görsel toplam **1020 KB**,
  hiçbiri 240 KB üstü. Yani "indirilemez, bu yüzden görünmez" teorisi yanlış.
- **6 slayt da yükleniyor:** `img.home-hero-slide` üzerinde
  `naturalWidth > 0 && complete === true` — 6/6. Sayaç/rotasyon da 6 ilçeyi
  döndürüyor (önceki turda doğrulanmıştı).
- **Yine de gerçek bir kusur var:** `check-frontend-source.mjs` 500 KB bütçesi
  yalnız sayfa hero'larını denetliyor; ilçe görselleri kapsam dışı. Kapı
  genişletilmeli ve mobil "yükleniyor mu" E2E'si eklenmeli — bu iki iş
  LANE-INFRA (`scripts/**`) ve LANE-QA (`tests/**`) sahipliğinde. Devredildi.

### Bulgu 4 — #361 artığı: `sector-explorer.test.tsx` ertelenmiş `fa` yaması (düzeltildi)

- **Gözlem:** test, `fa` kataloğuna üç anahtarı elle `{count, number}` yapıp
  yamıyordu (kataloğun henüz tiplenmediği dönemden). `main`'de katalog tiplenmiş,
  yama gereksiz ve yanıltıcı.
- **Düzeltme:** yama ve eski yorum kaldırıldı; test artık gerçek katalogları
  okuyor. `fa` render'ı canlı doğrulandı: sektör toplamı `۱۶` (Farsça rakam),
  `aria-label` de `مجموع …: ۱۶`, Latin rakam yok, RTL taşma 0.

### Çalıştırılan kontroller

- `bun run lint` ✅ · `bun run typecheck` ✅ · `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ **704 pass / 0 fail / 2 todo** (706 test)
- `design-tokens.test.ts` ✅ 15/15; **negatif test edildi** — bir hedefi 44→20px
  (footer-social-link), 44→38px (vend-duration) ve 44→36px (pwa-update-primary)
  çekince guard gerçek sayıyla kırmızı düştü.
- axe-core (spec'in birebir kopyası, sistem chromium ile): 5 dil × tüm public
  rotalar + tr/de/fa masaüstü = **112 kontrol, 0 ihlal**. (tr rotaları sandbox'ın
  standalone sunucusundaki bilinen `localePrefix` 308 döngüsü yüzünden koşamadı;
  bu sunucu yapılandırma artefaktı, CSS ile ilgisiz.)

### Sahibin / sonraki lane'lerin yapması gerekenler

- **LANE-INFRA:** `scripts/check-frontend-source.mjs` 500 KB bütçesine ilçe
  görsellerini ekle (kapsam eksikliği; kapı kapsamadığı yüzeyi koruyamaz).
- **LANE-QA:** mobil E2E — her ilçe slaytının `naturalWidth > 0` yüklendiğini
  assert et (mevcut guard yalnız metin/layout denetliyor).
- **LANE-TASARIM (sonraki tur):** `editorial-page-scene-video-controls` 31px
  düğmelerini 44px'e çıkarmak sahne/copy yerleşimini birlikte ele almayı gerektirir.

**Değişen dosyalar:** `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
`src/components/home/sector-explorer.test.tsx` — üçü de bu lane'in kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-06, tur 14 — #436)

Branch: `lane/tasarim`. Taban: `origin/main` @ `e172ed8` (tur 13 squash-merge
edildikten sonra yeniden kuruldu).

### Bulgu 1 — #436: ilçe hero kaynakları bütçenin üstünde, kapı görmüyor (düzeltildi)

- **Kabul ölçütü 1 (kaynak <500 KB):** `Girne.webp` 1916 KB, `güzelyurt.jpg`
  951 KB, `lefkoşa.jpeg` 761 KB, `iskele.jpg` 683 KB idi. Dördü de yeniden
  kodlandı, **gerçek en-boy korunarak** (E2E kaynak genişliklerini pinliyor:
  girne 3840, güzelyurt 2048, iskele 1638, lefkoşa 1920):
  Girne 489654, güzelyurt 487863, lefkoşa 479236, iskele 498258.
- **Kabul ölçütü 2 (kapı):** `scripts/check-frontend-source.mjs` **LANE-INFRA**
  sahipliğinde; genişletme devredildi (#447). Bu turda kapsam, sahip olduğum
  `tests/unit/design-tokens.test.ts` içine taşındı: **"every image an owned
  component renders stays under the 500 KB budget"** — `src/components/**` ve
  `src/experience/**` içindeki her `/images/...` referansını gezer, 500 KB
  üstünü kırmızı yapar. Böylece ilçe hero'ları **ve** `unoptimized` galeri
  fotoğrafları tek kuralla korunuyor.
- **Kabul ölçütü 3 (mobil E2E):** `tests/**` **LANE-QA** sahipliğinde; #448'e
  devredildi (zaten açık).

### Bulgu 2 — account galerisi `unoptimized` ve iki foto 500 KB üstü (düzeltildi)

- **Gözlem:** `src/components/layout/account-scene-media.tsx:112` dört slaytı
  `unoptimized` ile basıyor; yani Next optimizer devre dışı ve **diskteki ham
  bayt** servis ediliyor. `girne-night.webp` 601590 B, `vuni-sarayi.webp`
  517942 B — kullanıcının gördüğü, bütçenin üstünde iki görsel.
- **Düzeltme:** ikisi de <500 KB'a yeniden kodlandı, en-boy korundu:
  girne-night 491362 (1440×1795), vuni-sarayi 489392 (1080×1350). Kalite
  kaybı ölçüldü: **SSIM 0.9805 / PSNR 38.0 dB** ve **SSIM 0.9946 / PSNR 39.3 dB**
  — gözle ayırt edilemez. Tarayıcıda 4/4 slayt `complete && naturalWidth>0`,
  servis edilen bayt = yeni boyut (optimizer yok, kanıt birebir).
- **Neden bu lane:** `src/components/**` sahibi LANE-TASARIM.

### Micro-denetim (AUDIT.md boyutları, sahip olunan dosyalar)

| Dosya | Doğruluk | Hata yolu | Yetki | Erişilebilirlik | Kontrast | RTL | Linkler | Mantık | Sınır girdi |
|---|---|---|---|---|---|---|---|---|---|
| `src/components/layout/account-scene-media.tsx` | ✅ | ✅ `videoError` durumu | n/a (sunum) | ✅ `aria-hidden` dekoratif, `role=group` etiketli | ✅ axe 0 | ✅ | ✅ | ✅ | ✅ |
| `tests/unit/design-tokens.test.ts` | ✅ | ✅ guard mesajı yol+boyut | n/a | n/a | ✅ | n/a | n/a | ✅ | ✅ boş dizin/eksik dosya |
| `src/components/home/home-experience.tsx` | ✅ 6 ilçe | ✅ | n/a | ✅ `alt=""` dekoratif | ✅ | ✅ | ✅ | ✅ | ✅ |
| `public/images/*.webp/jpg` | ✅ boyut <500 KB | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✅ en-boy korundu |

Bakılmayan dosya yok; sahip olunan tüm yollar tarandı.

### Çalıştırılan kontroller

- `bun run lint` ✅ · `bun run typecheck` ✅ · `bun run check:frontend-source` ✅
- `bun run test:unit` ✅ **741 pass / 0 fail**
- Yeni guard **negatif test edildi**: `girne-night.webp` ve `vuni-sarayi.webp`
  eski boyutuna döndürülünce guard gerçek boyutla kırmızı düştü; geri alınınca
  yeşil.
- axe-core (spec'in birebir kopyası, sistem chromium ile): **17 kontrol**
  (en/de/fa × 5 rota mobil + de/fa masaüstü) = **0 ihlal**; mobil anasayfa
  hero'sunda 6/6 slayt yüklü (`naturalWidth>0 && complete`).

### Sahibin / sonraki lane'lerin yapması gerekenler

- **LANE-INFRA (#447):** `check-frontend-source.mjs` 500 KB bütçesine tüm ilçe
  görsellerini ekle (kapı kapsamadığı yüzeyi koruyamaz).
- **LANE-QA (#448):** mobil (375×667) anasayfa E2E'si — her slaytta
  `naturalWidth > 0` assert et.

**Değişen dosyalar:** `public/images/Girne.webp`,
`public/images/güzelyurt.jpg`, `public/images/iskele.jpg`,
`public/images/lefkoşa.jpeg`, `public/images/account-gallery/girne-night.webp`,
`public/images/account-gallery/vuni-sarayi.webp`,
`tests/unit/design-tokens.test.ts`, `docs/lanes/05-tasarim.md` — hepsi bu lane'in
kapsamında.

---

## LANE-TASARIM çalışma notları (2026-11-10, tur 15)

Branch: `lane/tasarim`. Taban: `origin/main` @ `de853df`. Kurtarma turu — alan
taranmadı, brief'ten **tek küçük, sınırlı** bulgu seçildi ve commit edildi.
Kuyrukta `lane:tasarim` etiketli üç açık iş var (#461, #455, #436); üçünün de
sahipliği karışık/başka lane'lere devirli olduğu için bu turda **sahip olduğum
`src/styles/global.css` + guard'ım** üzerinde duran somut bir kusur alındı.

### Bulgu 15 — Yönetici hata metni **tanımsız** bir renk token'ı tüketiyordu (düzeltildi)

- **Gözlem:** `src/styles/global.css:8013`
  `.admin-package-message[data-status="error"]`, `.admin-mfa-error` kuralı
  `color: var(--color-status-danger, #a13632);` diyordu. `--color-status-danger`
  **tüm repoda hiçbir yerde tanımlı değil** (`grep -rn` → yalnız bu tüketim;
  palet `--color-status-{success,warning,error}*` içeriyor, `danger` yok). Yani
  bildirim sessizce satır içi `#a13632`'ye düşüyordu.
- **Etki:** yönetici panelindeki hata mesajları — `admin-mfa-gate.tsx:103`
  `role="alert"` dâhil — hiçbir token'ın tarif etmediği bir renkle boyanıyordu.
  Kanonik hata token'ı `--color-status-error: #b42318`; `#a13632` onun
  neredeyse-ama-farklı bir kopyası. Kontrast her ikisinde de AA üstü
  (`#a13632`→`#fffdf8` 6.69:1, `#b42318`→6.47:1), yani **kontrast kapısı
  göremezdi**; kusur "iki farklı kırmızı" sınıfı ve tanımsız-token sızıntısı.
- **Kök neden:** CSS'te tanımsız bir custom property hata değildir; `var()` fallback'e
  çözülür. Bu yüzden ne `check:frontend-source` ne `test:unit` ne axe düştü.
  `design-token-drift.baseline.json` ise bu satırı **meşrulaştırmıştı** (kayıtlı
  hardcoded hex), yani guard onu "izinli" sayıyordu.
- **Düzeltme:** tüketim kanonik `var(--color-status-error)`'a çevrildi; artık
  ham hex yok, fallback yok. Baseline'daki ilgili satır **çıkarıldı**
  (ratchet yalnız küçülür; `count` 53→52).
- **Kanıt (kontrast, WCAG formülü):** `#b42318` üzerinde `#fffdf8` = **6.47:1**,
  `#ffffff` = 6.57:1 → AA/AAA metin için rahat; seçilen renk yönetici hata
  yüzeylerinin (açık kanvas) üstünde okunur kalıyor.
- **Guard (negatif test edildi):** `tests/unit/design-tokens.test.ts` — yeni test
  "every colour token a rule consumes is declared": yorumları çıkarır, `var()`
  içinde tüketilen her `--color-*`'ı toplar ve her birinin sheet'te tanımlı
  olmasını şart koşar. Düzeltme geri alınınca test **`--color-status-danger`**
  değeriyle kırmızı düştü; geri konunca yeşil.

### Çalıştırılan kontroller

- `bun run lint` ✅
- `bun run typecheck` ✅
- `bun run check:frontend-source` ✅ (41 token)
- `bun run test:unit` ✅ **919 pass / 0 fail / 2 todo** (+1 yeni guard)
- Negatif test: yeni guard tanımsız token geri konunca kırmızı ✅

### Sahibin / sonraki lane'lerin yapması gerekenler

- **#461 (QR indirme yüzeyi):** sahiplik çelişkisi — issue `src/features/pwa/**`
  + `src/app/[locale]/install/**` diyor ama tablo `src/app/[locale]/**`'yi
  LANE-SEO'ya, `src/features/pwa/**`'yı da LANE-URUN'a (`src/features/**`) veriyor;
  TASARIM'ın `src/features/**` satırı yok. QR görselini `/install` sayfasına
  eklemek `src/app/[locale]/install/page.tsx` (LANE-SEO) veya
  `src/features/pwa/install-experience.tsx` (LANE-URUN) dokunmayı gerektiriyor.
  Sahiplik netleşmeli; benim dosyalarımdan birine QR eklemek yanlış katman olur.
- **#455 (motion site geneli)** ve **#436 (ilçe görselleri)** zaten başka
  lane'lere devirli/açık.
- Değişen dosyalar: `src/styles/global.css`, `tests/unit/design-tokens.test.ts`,
  `tests/unit/design-token-drift.baseline.json`, `docs/lanes/05-tasarim.md` —
  hepsi bu lane'in kapsamında.
