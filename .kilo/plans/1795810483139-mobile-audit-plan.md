# İşBul KKTC — Mobil Uçtan Uca Denetim Uygulama Planı

**Kapsam:** 360px / 390px / 768px ekran genişlikleri, dokunmatik (touch/pointer) cihazlar, Core Web Vitals (LCP, INP, CLS).
**Durum:** Salt-okunur analiz tamamlandı, kaynakta hiçbir değişiklik yapılmadı.
**Plan dosyası:** `.kilo/plans/1795810483139-mobile-audit-plan.md`

---

## 1. Özet Bulgular

| Seviye | Sayı | Örnek |
|--------|------|-------|
| Kritik (işlev çalışmıyor) | 6 | Hero 6 görsel eşzamanlı indirme; `< 16px` input font-size iOS zoom; `mobile-menu-button` `display` çaklaşması; admin sekme çubuğu mobilde görünmez sekme |
| Yüksek (tasarım / taşma / hız) | 14 | GSAP/Lenis her sayfada; `backdrop-filter` hero; CSS duplicate seçiciler; hero `min-height: 450px` CLS; job card animasyonu |
| Orta (UX iyileştirme) | 11 | Skip-link yok admin'de; dil menüsü `< 44px`; dışarıya tıklayarak menü kapanmıyor; CV dosya adı kırpımı |

---

## 2. Kritik Bulgar ve Çözüm Planı

### 2.1 Hero 6 görsel eş zamanlı indirme (LCP / bant genişliği)
**Dosya:Satır:** `src/components/home/home-experience.tsx:249-264`, `src/styles/global.css:5176-5197`

**Sorun:** `homeHeroSlides`'taki 6 görsel hepsi `<Image fill>` ile aynı `.hero-photo` konteynerinde render ediliyor. Tarayıcı tüm 6'ını indirir; sadece biri görünür. `home-hero-photo-cycle` animasyonu 48s süresiz tümünü göstermeye çalışır.

**Çözüm (karar: Seçim A):**
1. `homeHeroSlides`'taki tüm 6 slayt `<Image fill>` ile DOM'da kalmaya devam eder ama sadece ilk slayt (`girne`) `loading="eager"` / `fetchPriority="high"` olarak kalır; diğer 5 slayt `loading="lazy"` + `style={{ display: 'none' }}` ile gizlenir, böylece tarayıcı sadece 1 görsel indirir.
2. `prefers-reduced-motion: reduce` altında `home-hero-photo-cycle` animasyonunu tamamen devre dışı bırak (`animation: none` ve ilk slayt `opacity: 1`, diğerleri `opacity: 0`).
3. Dokunmatik ile duraklatma ekle: `touchstart` / `pointerdown` üzerinden animasyonu durdur, `pointerup` üzerinden devam ettir.
4. Slayt geçişi (ileri/geri) sonraki bir improvement ticket'e bırakılır; bu plan kapsamında sadece "ilk görünen slayt diğerinden önce indirilir" kuralı sağlanır.

**Doğrulama:** Chrome DevTools Network panelinde mobil (360px) ilk yüklemede sadece 1 hero görsel indirilmeli; LCP adayı `/images/Girne.webp` olmalı.

---

### 2.2 iOS otomatik zoom — input font-size < 16px
**Dosya:Satır:**
- `src/styles/global.css:1814-1819` — hero arama inputu `font-size: 11px` ardından `10px`
- `src/styles/global.css:545` — home job search keyword inputu `font-size: 12px`
- `src/styles/global.css:7447` — `.home-job-search-field input/select` `font-size: 12px`
- `src/styles/global.css:13350, 13357` — jobs filter inputları `font-size: 13px`

**Sorun:** iOS Safari, `font-size < 16px` olan `<input>` / `<select>` alanlarına odalandığında sayfayı otomatik zoomlar. Bu arama akışını bozar.

**Çözüm:** Tüm arama / filtre inputlarını ve selectleri mobilde minimum `16px` yapın. `@media (max-width: 740px)` bloğunda input font-size'larını `16px`'e çıkarın.

**Doğrulama:** iOS Simulator veya Chrome mobile emulation'da input'a tıklandığında sayfa zoom olmamalı.

---

### 2.3 `mobile-menu-button` çakışan `display` kuralları
**Dosya:Satır:** `src/styles/global.css:444-445`, `global.css:1144-1147`, `global.css:1592-1593`, `global.css:2666-2668`

**Sorun:** Aynı sınıf 4 kez farklı `display` değeriyle tanımlanmış (`none` / `grid`). CSS sırası son tanıma sahip çıkar; 360px'te menü butonu kaybolabilir veya görünür olabilir.

**Çözüm:** Tek bir `mobile-menu-button` tanımı kalmalı. `@media (max-width: 740px)` içinde `display: grid`, dışında `display: none`. Çakışan diğer blokları (1592, 2666) kaldırın.

**Doğrulama:** 360px, 390px, 768px'te hamburger butonu her zaman görünür ve tıklanabilir olmalı.

---

### 2.4 360px'te "register" butonu gizli
**Dosya:Satır:** `src/styles/global.css:3039-3041`, `global.css:5011-5013`

**Sorun:** `@media (max-width: 380px)` ve `@media (max-width: 430px)` içinde `.header-post { display: none; }`. 360px cihazlarda kayıt butonu tamamen erişilemez.

**Çözüm:** `display: none` kalarını kaldırın; 360px'te de register butonu görünür olmalı (yastık/boşluk daraltılarak sığdırılmalı).

**Doğrulama:** 360px'te `/register` butonu görünür ve tıklanabilir olmalı.

---

### 2.5 Dil menüsü `< 44px` touch hedefi (360px)
**Dosya:Satır:** `src/styles/global.css:3215-3220`

**Sorun:** `@media (max-width: 380px)` içinde `.language-switch` `min-width: 45px` ve svg gizli; WCAG 2.5.8 44px minimum hedef altına düşebilir.

**Çözüm:** 360px'te de `min-height: 44px` ve `min-width: 44px` korunmalı; svg gizlenirse sadece metin kalsın ama hedef boyut 44px'de kalsın.

---

### 2.6 Admin sekme çubuğu mobilde yatay taşma / görünmez sekme
**Dosya:Satır:** `src/components/admin/admin-console-nav.tsx:29-44`, `src/styles/global.css:8856-8866`

**Sorun:** `.admin-console-nav-list { overflow-x: auto; white-space: nowrap; }` — 5 uzun Türkçe sekme etiketi 360px'te kaydırılabilir ama scroll ipucu yok; kullanıcı daha fazla sekme olduğunu göremez.

**Çözüm:** 360px'te sekme listesini yatay kaydırımdan dikey yığınlayıma (`flex-direction: column`) geçirin, veya sekme başlıklarını kısaltın ("İş İlanları" → "İlanlar", "İşveren Paketleri" → "Paketler"). Scroll ipucu ekleyin (ör. şerit veya "daha fazla" göstergesi).

---

### 2.7 Menü dışarıya tıklayarak kapanmıyor
**Dosya:Satır:** `src/components/layout/site-header.tsx:124-134, 137-172`

**Sorun:** Menü açıldığında dışarıya tıklama (click-outside) handler yok; sadece hamburger.toggle ve Escape tuşu var.

**Çözüm:** `document.addEventListener('mousedown', ...)` veya `pointerdown` ekleyin; menü açıkken header dışına tıklandığında `closeMenu()` çağrılsın.

---

## 3. Yüksek Seviyeli Bulgular ve Çözüm Planı

### 3.1 GSAP + Lenis her sayfada yükleniyor (INP)
**Dosya:Satır:** `src/components/motion/motion-controller.tsx:42-140`

**Sorun:** ~150-200 KB JS her sayfada lazy import ediliyor; mobilde ana iş parçacığında parse/compile olur.

**Çözüm:** `MotionController`'ı sadece animasyon gerekli sayfalarda koşullu render edin; `prefers-reduced-motion` tamamen devre dışı bırakılmalı (animasyon + smooth scroll durdurulmalı).

---

### 3.2 Hero `backdrop-filter` ve gradient katmanları (INP / GPU)
**Dosya:Satır:** `src/styles/global.css:1607-1670`, `src/components/home/home-experience.tsx:266-268`

**Sorun:** Üç `hero-light-layer` div'i ve `.home-hero-rays` (3 gradient + radial, `mix-blend-mode: screen`, `animation: home-hero-rays-drift 26s`) sürekli kompozit etki altında.

**Çözüm:** 360px'te `.home-hero-rays`'nin animasyonunu devre dışı bırak; `backdrop-filter` katmanlarını azaltın veya mobilde statik gradient kullanın.

---

### 3.3 CSS duplicate seçiciler (global.css 16.319 satır)
**Dosya:Satır:** `src/styles/global.css` — aşağıdaki sınıflar 2+ kez farklı değerle tanımlanmış:

| Sınıf | Satırlar | Çakışan özellik |
|-------|----------|----------------|
| `.site-header` | 254, 1376 | `sticky` vs `absolute` |
| `.header-inner` | 263, 1391 | `min-height`, `gap` |
| `.desktop-nav` | 277, 1490, 7334 | `margin-inline-start`, `display` |
| `.desktop-nav a` | 283, 1496 | `color`, `font-size`, `gap`, `white-space` |
| `.header-actions` | 310, 1529 | `gap`, `margin-inline-start` |
| `.language-switch` | 315, 1535, 3064 | `width/height`, `min-width/min-height`, `border-radius` |
| `.header-login` | 337, 1559 | `padding`, `color`, `white-space` |
| `.header-post` | 433, 1575, 2634, 2805, 3023, 5011 | `min-height`, `padding`, `border-radius`, `display: none` |
| `.mobile-menu-button` | 444, 1592, 2815 | `display: none` / `display: grid` |
| `.mobile-nav` | 455, 1603, 2669, 2819 | `display: none` / `position: absolute` |
| `.hero-section` | 463, 1607, 2744, 2823, 5118 | `padding`, `height`, `background` |
| `.hero-layout` | 475, 1671, 2749, 2828, 3426, 5233 | `grid-template-columns` vs `flex`/`block` |
| `.hero-copy h1` | 504, 1715, 2757, 2843, 4982 | `max-width`, `margin`, `font-size` |
| `.search-field` | 525, 533, 1781, 1791, 2759, 2858 | `border`, `padding`, `min-height`, `gap` |
| `.search-submit` | 557, 1827, 2766, 2868, 3442, 12893 | `min-width`, `padding`, `border-radius` |
| `.footer-*` (tüm footer sınıfları) | 800-947, 2562-3027 | İki farklı footer bloğu |

**Çözüm:** Tüm duplicate seçicileri tek kaynaktan birleştir; mobil-first mantığıyla `@media (max-width: 740px)` ve `@media (max-width: 380px)` bloklarını tek içinde toplayın.

---

### 3.4 Hero `min-height: 450px` CLS kaynağı
**Dosya:Satır:** `src/styles/global.css:1614`

**Sorun:** 360px cihazda hero ekranın büyük bölümünü kaplar; aşağıdaki içerik geç görünür (CLS).

**Çözüm:** 360px'te `min-height` değerini düşürün veya hero içeriği için dinamik yükseklik kullanın.

---

### 3.5 Job card `animation: card-in` CLS / ana iş parçacığı yükü
**Dosya:Satır:** `src/styles/global.css:666-672`

**Sorun:** Listedeki her kart ayrı `animation-delay` ile yield yapıyor; 20+ ilan için sürekli compositing.

**Çözüm:** Mobilde animasyon gecikmesini kaldırın veya tüm kartları tek seferde görünür yapın.

---

### 3.6 `deviceSizes` eksik (next.config.ts)
**Dosya:Satır:** `src/next.config.ts:79-102`

**Sorun:** `images` konfigürasyonunda `deviceSizes` yok; Next varsayılanları mobil için optimal değil.

**Çözüm:** `deviceSizes: [360, 390, 640, 750, 828, 1080]` ekleyin.

---

## 4. Orta Seviyeli Bulgular

### 4.1 Admin sayfalarında skip-link / klavyenel odaklanma yok
**Dosya:Satır:** `src/app/[locale]/(admin)/admin/company-profiles/page.tsx:64`

**Sorun:** `AdminConsoleNav` sonrası doğrudan içerik; klavyenel kullanıcı gezinme sekmesini geçmek zorunda.

**Çözüm:** Admin sayfalarına skip-link ekleyin veya `AdminConsoleNav`'den sonra odaklanabilir bir başlık ekleyin.

### 4.2 Talent pool tablosu mobilde `overflow-x` eksik
**Dosya:Satır:** `src/features/talent-pool/admin-talent-pool-client.tsx:279-326`, `src/styles/global.css:9648-9653`

**Sorun:** `.admin-entries-table-wrap` var ama `overflow-x: auto` kuralı doğrulanamadı; 7 sütunlu tablo 360px'te taşabilir.

**Çözüm:** `.admin-entries-table-wrap` için `overflow-x: auto` garantili olun.

### 4.3 Admin company-profiles `<table>` responsive değil
**Dosya:Satır:** `src/app/[locale]/(admin)/admin/company-profiles/page.tsx:260-290`, `src/styles/global.css:7006-7016`

**Sorun:** `.company-deletion-table { overflow-x: auto; }` var ama table `min-width: 600px` ve `white-space: nowrap` — 360px'te taşma riski.

**Çözüm:** 360px'te table sütunlarını wrapping yapın veya horizontal scroll garantili olun.

### 4.4 CV dosya adı mobilde kırpılıyor
**Dosya:Satır:** `src/features/candidates/candidate-profile-form.tsx:721-743`, `src/styles/global.css:5462-5492`

**Sorun:** `.candidate-resume-file { white-space: nowrap; }` — uzun dosya adı 360px'te kırpılıyor; kullanıcı hangi dosyayı seçtiğini göremiyor.

**Çözüm:** `white-space: normal` veya `text-overflow: ellipsis` + `overflow: hidden` ekleyin; dosya adını iki satıra sığdırın.

### 4.5 Company directory 3-sütunlu grid 360px'te dar
**Dosya:Satır:** `src/styles/global.css:10981-10986` (grid-template-columns: repeat(3)), `global.css:12330-12332` (740px'te 2 sütun), 360px'te tek sütun yok

**Sorun:** 360px'te company-directory-grid hala 2 sütunda kalıyor (`max-width: 740px` media query'sinde `repeat(2)`); 360px'te tek sütuna geçiş eksik.

**Çözüm:** `@media (max-width: 480px)` içinde `grid-template-columns: minmax(0, 1fr)` ekleyin.

### 4.6 Packages interaktif showcase (Three.js/vend) mobilde test edilmemiş
**Dosya:Satır:** `src/components/packages/packages-interactive-showcase.tsx`, `src/styles/global.css:9810-10388`

**Sorun:** `packages-vend-canvas { touch-action: pan-y; }` var ama vend panelinin 360px'teki davranışı kontrol edilmemiş; `vend-panel` `max-height: 68%` mobilde.

**Çözüm:** Vend panelinin 360px'te tamamen erişilebilir olduğunu doğrulayın; butonları 44px minimum hedefte olsun.

### 4.7 Admin packages / outreach form alanları mobilde genişlik sorunu
**Dosya:Satır:** `src/app/[locale]/(admin)/admin/packages/page.tsx:74-155`, `src/app/[locale]/(admin)/admin/outreach/page.tsx:96-108`

**Sorun:** `OutreachComposer` ve admin formlarının 360px'teki davranışı tam olarak incelenmemiş.

**Çözüm:** Tüm admin form inputlarını 360px'te `width: 100%` ve minimum 44px touch hedefiyle doğrulayın.

### 4.8 Footer linkleri 360px'te 2 sütun, okunabilirliği sınırlı
**Dosya:Satır:** `src/styles/global.css:3012-3014` (footer-links repeat(2))

**Sorun:** 360px'te footer-links 2 sütun; uzun Türkçe linkler kırılabilir.

**Çözüm:** 360px'te footer-links tek sütuna geçirin.

---

## 5. Uygulama Sırası (Öncelikli)

### Aşama 1 — Kritik (işlev bloklayan)
1. [ ] Hero 6 görseli: sadece ilk görünen (`girne`) `loading="eager"`/`fetchPriority="high"` olarak kalır; diğer 5 slayt `loading="lazy"` + `display:none` (`home-experience.tsx`)
2. [ ] `prefers-reduced-motion` altında hero animasyonunu tamamen durdur (`global.css:5176-5197`)
3. [ ] Hero dokunmatik duraklatma (`touchstart`/`pointerdown`) ekle (`home-experience.tsx`)
4. [ ] Tüm arama/filtre inputlarını mobilde `16px` yapın (`global.css` input blokları)
5. [ ] `mobile-menu-button` tek `display` kuralı; diğerleri kaldırın (`global.css`)
6. [ ] 360px'te register butonu geri getirilsin (`global.css:3039-3041`, `5011-5013`)

### Aşama 2 — Yüksek (tasarım / taşma / hız)
7. [ ] GSAP/Lenis koşullu yükleme (`motion-controller.tsx`)
8. [ ] Hero `backdrop-filter` / `.home-hero-rays` mobilde statik yapın (`global.css`)
9. [ ] CSS duplicate seçicileri tekilleştirin (`global.css`, tüm duplicate bloklar)
10. [ ] Hero `min-height` 360px'te düşürülsün (`global.css:1614`)
11. [ ] Job card animasyon gecikmesi mobilde kaldırılsın (`global.css:666-667`)
12. [ ] `deviceSizes` eklensin (`next.config.ts`)
13. [ ] Admin sekme çubuğu mobilde yığınlayın veya kısaltın (`admin-console-nav.tsx`, `global.css:8856-8866`)
14. [ ] Menü dışarıya tıklayarak kapanır olsun (`site-header.tsx`)

### Aşama 3 — Orta (UX iyileştirme)
15. [ ] Admin skip-link ekleyin (admin sayfaları)
16. [ ] Talent pool tablo `overflow-x: auto` garantisi (`global.css:9648-9653`)
17. [ ] Admin company-profiles table 360px'te wrapping (`global.css:7006-7016`)
18. [ ] CV dosya adı `white-space: normal` (`global.css:5473`)
19. [ ] Company directory 360px'te tek sütun (`global.css:10981-10986`)
20. [ ] Footer links 360px'te tek sütun (`global.css:3012-3014`)
21. [ ] Vend showcase 360px erişilebilirlik doğrulaması
22. [ ] Admin form inputları 360px'te `width: 100%`

---

## 6. Doğrulama / Test Planı

### 6.1 Ekran genişlikleri
Her değişiklikten sonra şu genişliklerde manuel veya Playwright ile doğrulama:
- **360px** (küçük mobil) — kritik
- **390px** (standart iPhone)
- **768px** (tablet)

### 6.2 Dokunmatik / pointer
- `touchstart`, `pointerdown`, `pointerup` handler'larının çalıştığı
- 44px minimum touch hedefi (WCAG 2.5.8) — her buton, link, select
- Menü dışarıya tıklama kapanışı
- Escape tuşu menü kapanışı (zaten var, doğrulanmalı)

### 6.3 Core Web Vitals
- **LCP:** İlk hero görseli `/images/Girne.webp` olmalı; diğer 5 indirilmemeli
- **INP:** GSAP/Lenis sadece gerekli sayfalarda; hero `backdrop-filter` mobilde statik
- **CLS:** Hero `min-height` 360px'te düşük; job card animasyon gecikmesi yok

### 6.4 iOS Zoom
- Tüm `<input>`, `<select>`, `<textarea>` font-size `>= 16px` olmalı
- Odalandığında sayfa zoom olmamalı

### 6.5 CSS doğrulama
- `global.css`'te hiçbir sınıf 2+ kez farklı değerle tanımlanmamalı
- `@media (max-width: 740px)` ve `@media (max-width: 380px)` blokları tek kaynaktan

### 6.6 Komutlar (bun kullanılır)
```bash
bun run lint
bun run typecheck
bun run check:frontend-source
bun run test:unit
bun run build
```

---

## 7. Out of Scope (bu plan aşamasında yapılmayacak)

- Veritabanı migration veya Supabase RLS değişikliği
- Backend API değişikliği
- Yeni sayfa veya komponent oluşturma
- Commit / push işlemleri (kullanıcı açıkça istemezse)

---

## 8. Riskler ve Rollback

| Risk | Önlem |
|------|-------|
| CSS duplicate kaldırma sonrası beklenmeyen görünüm | Her blok kaldırılmadan önce mevcut davranış screenshot alınıyor; değişiklikler tek tek uygulanıyor |
| Hero lazy loading sonrası LCP regresyonu | İlk slayt `eager`/`high` kalıyor; LCP ölçümü yapılıyor |
| Input font-size 16px sonrası tasarım bozulması | Mobilde padding/gap daraltılarak sığdırılıyor |
| Admin sekme yığınlaması sonrası navigasyon karmaşası | Sekme isimleri kısaltılıyor; aktif sekme vurgulanıyor |

---

**Not:** Bu plan implementation-ready'dir. Kaynak kod değişikliği gerektiren her madde, yukarıdaki `Dosya:Satır` referansları ile netleştirilmiştir. Kullanıcı onayıyla implementation-capable agent tarafından uygulanabilir.