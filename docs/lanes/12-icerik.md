# LANE-İÇERİK — kullanıcı metni, 6 dil, ürün dili

Kullanıcının **gördüğü her kelimenin** sahibi. `src/messages/**` (6 dil) ve
kullanıcı yüzeyindeki metin.

## Neden ayrı lane

Bu alan **sahipsizdi**. Sonuç: iç veri kalitesi metrikleri kullanıcı yüzeyine
sızdı (#220 — "Güvenilir ilçe bilgisi bulunmayan 53 şube…"). Kimse sahibi
olmadığı için kimse fark etmedi.

## Sahip olduğun yollar

`src/messages/**` (tr, en, ru, el, fa, de), `src/i18n/**`,
`src/content/**` (metin kısmı; JSON-LD üreticileri GEO'nun)

## Değişmez kurallar

1. **6 dil zorunlu.** Bir anahtar bir dilde varsa hepsinde olmalı. Eksik anahtar
   test ile yakalanır.
2. **Anahtar yeniden adlandırılırsa** aynı PR'da tüm diller güncellenir.
3. **Yer tutucular korunur:** `{count}`, `{name}` birebir.
4. **Çeviri değil, uyarlama.** Kelime kelime değil; dilin kendi doğallığında.
5. **Uzun metin `de` ile, RTL `fa` ile sınanır.**

## Kullanıcı dili kuralları (bu lane'in asıl işi)

### Kullanıcıya yalnızca kendi eylemini açıklayan bilgi gösterilir
- ✅ "Bu ilçede 12 şirket listeleniyor."
- ❌ "Güvenilir ilçe bilgisi bulunmayan 53 şube, filtre seçildiğinde dahil edilmez."

İç metrik (veri kalitesi, kaynak sayısı, eşleşmeyen kayıt) **kullanıcı yüzeyine
girmez** — log, analytics veya iç panel.

### Yasak dil
- İç sistem sözlüğü: "kaynak koordinatları", "senkron", "içe aktarma",
  "veritabanı", "şube sayısı", "dahil edilmez", "hariç tutulur"
- Kusur anlatan ifade: kullanıcı neyi **kaçırdığını** değil, neyi **bulduğunu** görür
- Suçlayıcı hata: "Hatalı giriş yaptınız" → "E-posta biçimini kontrol edin"
- Belirsiz hata: "Bir şeyler ters gitti" → ne olduğu + ne yapılacağı
- Boş durum: "Sonuç yok" → "Bu filtrede sonuç yok. Filtreyi genişletin."

### Ton
Güvenilir, net, yerel (KKTC), abartısız. Emir kipi yerine yönlendirme.

## Denetim protokolü

`docs/lanes/AUDIT.md` uygulanır. Bu lane için ek boyut:

**Her kullanıcı metni için sor:** kullanıcı bunu neden görüyor? Kendi eylemini mi
açıklıyor, yoksa sistemin iç işleyişini mi? İkincisiyse **kaldır** ya da doğru
yere taşı (footer, hukuki sayfa, admin).

`src/messages/**` içinde ara: sayı + iç terim ("kayıt", "şube", "kaynak",
"veri", "dahil edilmez"), olumsuz kusur dili, sistem hata kodu.

## Kabul ölçütü
- Kullanıcı yüzeyinde iç metrik **yok**
- 6 dil tam ve tutarlı
- Uzun metin `de`'de taşmıyor, `fa` RTL doğru
- Her metin kullanıcının eylemini açıklıyor

## Tur 1 — mikro-denetim (2026-11-05)

**PR #267** (merge `dcdbfa3`) + **PR #276**. İki bulgu sınıfı kapatıldı.

### 1. Ölü mesaj anahtarları (#255)

`src/messages/**` içindeki her katalog yaprağı için `src/**`'ta literal veya
şablon referansı tarandı. **19 anahtarın hiçbir çağıranı yoktu**, altı dilde de:

- `BlogPage`: `sourceSearchLink`, `latestBadge`, `localNewsBadge`,
  `illustrativeImage`, `emptyBody`, `editorialNoteTitle`, `editorialNoteBody`,
  `photoLicense`, `sourceLabel`
- `CompanyDirectory`: `sourceProfileLink`, `sourceListingLink`,
  `categoryPlaceholder`, `districtDataNote`
- `CandidateDashboard.sectionsDescription`
- `CompanyManagement`: `workspace.documentsTitle`, `directoryTargetNone`,
  `directoryTargetHint`
- `DistrictPage.countLabel`, `JobTypePage.countLabel`
- `Guides.allGuides`

`districtDataNote` #220'de kod tarafında kaldırılmıştı; kalan 18'i aynı sınıftan.
Kaldırıldı (6 dil, 1150 anahtar, parite korundu).

**Yöntem notu (tekrar kullanılabilir).** Geniş "kullanılıyor mu" sezgisi
yanıltıcı: `copy(\`sectors.${key}.title\`)` gibi şablonlar ve dizi/`map`
üzerinden dolaylı kullanım sahte pozitif üretir. Güvenilir ölçüt: katalog
yaprağının **son segmenti** (`leaf`) tüm `src/**` (test hariç) içinde kelime
sınırıyla geçiyor mu? Sıfır geçen = ölü. Yalnız leaf adı başka bir yerde
geçiyorsa (örn. `directoryTarget` bir değişken adı) elle doğrula.

### 2. İç sözlük sızıntısı — `CompanyDirectory.sourceNote` (PR #276)

Brief satır 36 "kaynak koordinatları"nı yasaklı iç terim diye sayıyor; ama
`sourceNote` altı dilde de o cümleyle başlıyordu:
`"Kapsam kaynak koordinatlarına göre yaklaşık belirlenmiştir; …"`. Ziyaretçi
kapsamın nasıl hesaplandığını görmemeli. "Koordinat" iç sözlüğü çıkarıldı, iki
maddi uyarı (resmî sınır değil; listeleme ≠ tescil) korundu.

### Ratchet'ler (`src/i18n/message-catalogs.test.ts`)

1. Legal bloğu dil başına yazılmış mı (yalnız `contactEmail` aynı olabilir).
2. Legal başlık/bölüm başlıkları çevrilmiş mi.
3. `RETIRED_KEYS` — emekli anahtar UI'sı olmadan geri gelemez.
4. `FORBIDDEN_INTERNAL_PHRASES` — yasak iç sözlük tr katalogda görünemez.

### Devir

- **#141** (bayat `supabase/seed-managed-content.sql`): 18 `legal.*` satırının
  hepsi Türkçe; yönetilen içerik mesajları ezdiği için canlıda her dil tr döner.
  LANE-SUPABASE seed'i yeniden üretir. Bu lane `supabase/**` sahibi değil.

### Notlar

- `src/messages/**` sahiplik tablosunda LANE-İÇERİK olarak var; `scripts/lanes.json`
  ile çakışma yok.
- Yasak-liste testi **yalnız tr** üzerinde koşar (kaynak dil); çeviriler ondan
  türer. `resumeImport.title` gibi meşru "içe aktar" ifadeleri listeye alınmadı.
- Lane PR otomasyonu yeşil PR'ı otomatik merge ediyor; PR açıldıktan sonra gelen
  commit'ler yeni branch + PR ister (bu yüzden #276 ayrı açıldı).

## Tur 2 — mikro-denetim (2026-11-06)

**PR #308** (merge `9f79c01`). Altı bulgu sınıfı kapatıldı; hepsi kendi
dosyamda (`src/messages/**`, `src/i18n/**`).

### Bulgular

| # | Anahtar | Boyut | Gözlenen (tr / en) | Düzeltme |
|---|---|---|---|---|
| 1 | `AboutPage.realityBody` | iç sözlük | "kayıtlar **sağlanan kaynaklardaki**…" / "records from **supplied source files**" | Pipeline'ın kendi adı çıkarıldı; ziyaretçinin eylemi anlatılıyor |
| 2 | `CompanyDirectory.jobEmployersDescription` | iç sözlük | "**Kaynak ilanlarında** açık pozisyonu bulunan firmalar" / "in the **source listings**" | "Şu anda açık pozisyonu bulunan firmalar." |
| 3 | `BlogMeta.description`, `BlogPage.lead` | bayat metin | "haber başlıklarını **yayıncı kaynaklarıyla** takip edin" / "**links to their publishers**" | Bölüm özgün editoryal yazı; metin bunu anlatıyor |
| 4 | `BlogPage.feedAsideBody` | doğruluk | "**Son 30 günde yayımlanan**… başlıklar" | Renderer filtre uygulamıyor → "güncel editoryal başlıklar" |
| 5 | `ContactPage.nextBody` | iç sözlük | "kayıtların **kaynak veriden** geldiği" / "**source data**" | "Listelenmek, doğrulanmış profil anlamına gelmez." |
| 6 | `BlogPage.emptyTitle/metaTitle/metaDescription` | ölü anahtar | Çağıran yok | Silindi + `RETIRED_KEYS` |

### Ratchet genişletmesi

`src/i18n/message-catalogs.test.ts`:
- `RETIRED_KEYS`'e üç `BlogPage` anahtarı eklendi.
- `FORBIDDEN_INTERNAL_PHRASES` (tr): `kaynak veri`, `kaynak ilan`, `sağlanan kaynak`.
- **Yeni `FORBIDDEN_SOURCE_VOCABULARY`:** iç-sözlük yasağı artık **6 dilde** koşar
  (önceki tur yalnız tr'yi tarıyordu; çevirmen sızıntıyı hedef dilde geri
  getirebilirdi). `en`e "source listings" enjekte edilerek kırmızı→yeşil kanıtlandı.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Yer tutucu paritesi | 0 uyumsuz |
| Çevrilmemiş dize | yalnız meşru (marka `İşBul KKTC`, `WhatsApp`, `Lefke`/`Güzelyurt`, `—`) |
| İç sözlük (kaynak koordinat/veri/ilan, senkron, veritabanı, şube sayısı) | 0 eşleşme |
| Dışa link (`src/content/editorial|guides`) | 0 (`http(s)://` yok — RSS dönemi izi temiz) |
| Slug paritesi (editorial 3×6, guides 3×6) | tutarlı, çevrilmiş |
| `readMinutes` (5–7) | diller arası tutarlı |
| `src/content/ai-visibility/*` | **bakılmadı** — JSON-LD üreticisi GEO'nun |

### Notlar

- Lane PR otomasyonu yeşil PR'ı anında merge ediyor; **tüm commit'ler PR
  açılmadan önce olmalı**, yoksa sonraki commit yeni branch + PR ister (#308
  tam bu yüzden ayrı açıldı, `lane/icerik`'e force-push ile hizalandı).
- Kanonik branch adı `lane/icerik`; `scripts/lane-collisions.mjs` başka adı
  "does not own it" diye işaretler.

## Tur 3 — mikro-denetim (2026-11-05)

**Issue #327** (agent:content) + kapsam taraması. Sahip olduğum yollar:
`src/messages/**` (6), `src/i18n/**` (5), `src/content/**` (23). Tümüne bakıldı;
`src/content/ai-visibility/{geo-audit.test.ts,interface-catalog.ts}` **PR #337
(lane/geo, açık)** dosyaları — dokunulmadı.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/messages/de.json:1423` `DistrictPage.title` | doğruluk/çeviri | `"Jobs in {district}"` (en ile birebir) | Almanca şablon | Almanca sayfada İngilizce `<h1>` + İngilizce `CollectionPage.name` JSON-LD | düzeltildi → `"Stellenangebote in {district}"` |
| 2 | `src/messages/de.json:1434` `JobTypePage.title` | doğruluk/çeviri | `"{type} Jobs"` | Almanca şablon | aynı sınıf, 6 tür sayfası | düzeltildi → `"{type}-Stellenangebote"` |
| 3 | `src/messages/{de,en,el,fa,ru}.json` `{CompanyDirectory,CandidateDashboard,CompanyManagement}.districts` | tutarlılık | ikincil kataloglar `"Kyrenia (Girne)"`, `"Nikosia (Lefkoşa)"`, `"Güzelyurt"`, `"Никосия"`/`"Лефкоша"`, `"لفکوشا"` gibi Türkçe-türevi/parantezli varyantlar taşıyordu | `HomeJobSearch.districts` kanonik uluslararası adları | aynı ilçe sayfaya göre farklı adla görünüyordu; AI/arama motoru için yerel varlık tutarsız | düzeltildi (4 katalog × 6 dil kanonik sete hizalandı) |
| 4 | `src/content/ai-visibility/faq.ts:30..190` (6 dil) | iç sözlük | FAQ cevabı "**sağlanan kaynaklardaki** kayıtları" / "records from **supplied source files**" / "**bereitgestellten Quelldateien**" / "**παρεχόμενες πηγές**" | ziyaretçinin kendi eylemi | #308 `AboutPage.realityBody`'den bu dili çıkardı ama FAQ (DB'den servis edilir) aynı sızıntıyı taşıyordu | düzeltildi (6 dil) |
| 5 | `src/content/ai-visibility/faq.ts:126` (`fa`) | tutarlılık | "لفکوشا، غازی‌ماغوسا، گوزلیورت، ایسکله" | arayüzle aynı çevriyazı (`fa.json` + `guides/fa.ts`: نیکوزیا، فاماگوستا، مورفو، ترکومو) | Farsça yüzeyde ilçe adları iki ayrı sisteme bölünmüştü | düzeltildi |

### Ratchet genişletmesi (`src/i18n/message-catalogs.test.ts`, 5 test → 9)

- `FORBIDDEN_SOURCE_VOCABULARY.el` → `"παρεχόμενες πηγές"` eklendi.
- **Yeni:** FAQ metni de iç-sözlük yasağına tabi (`faqByLocale`, 6 dil) — katalog
  taraması FAQ'yu görmez.
- **Yeni:** `DistrictPage.title`/`JobTypePage.title` her dilde `en`'den farklı
  olmalı (kopya-İngilizce şablon geri gelemez).
- **Yeni:** `{CompanyDirectory,CandidateDashboard,CompanyManagement}.districts`
  kanonik `HomeJobSearch.districts` ile birebir eşleşmeli.
- **Yeni:** FAQ, altı ilçeyi arayüzle aynı adla anmalı (`DISTRICT_ALIASES`:
  tr `Gazimağusa`, ru `Лефка`, el `Αμμόχωστο`, de `Lefka` — kabul edilen çekim).

Her yeni ratchet, hedeflediği regresyon enjekte edilerek kırmızı→yeşil kanıtlandı.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Yer tutucu paritesi | tek fark `CompanyDirectory.resultCount` — ru'nun çoğul kümesi (few/many) meşru |
| ICU sözdizimi (6 dil, tüm yapraklar) | 0 hata |
| JSON round-trip (`ensure_ascii=False`, 2-space) | 6/6 birebir |
| İç sistem sözlüğü (senkron/veritabanı/koordinat/kaynak sayısı) | 0 (yalnız `resumeImport` meşru istisna) |
| Suçlayıcı/belirsiz hata | 0 (admin + "kontrol edin" tipi yönlendirme meşru) |
| Editorial/guides dışa link | 0 |
| Slug paritesi | çevrilmiş (kasıtlı); yapı paritesi: guides'ta tr 2 paragraf → çeviriler 1'e indirmiş (uyarlama) |
| `src/i18n/redirect.ts` açık yönlendirme | 0 (yol daima `/` ile köklenir; tüm çağrılar sabit literal) |
| Legal bloğu (#141) | katalog tarafı zaten düzeltilmiş (yalnız `contactEmail` aynı) |

### Devir

- **FAQ seed'i:** `faq.ts` değişti ama `supabase/seed-managed-content.sql`
  (`faq_entries`, 36 satır) hâlâ eski metni taşıyor; `getManagedFaq` DB'yi
  önceler, yani canlıda eski cevap döner. `supabase/**` LANE-SUPABASE'in →
  seed yeniden üretilmeli (`scripts/generate-managed-content-seed.ts`).
  #141'in legal seed kısmı da hâlâ bu lane'in dışında.
- **`src/content/ai-visibility/llms-brief.ts:247-248`** iç sözlük ("kamuya açık
  **kaynak** işveren listelerinden derlenir; **provenans kaydı** tutulur") —
  GEO'nun üreticisi, PR #337 o dizinde açık → LANE-GEO'ya devir.

## Tur 4 — mikro-denetim: Farsça rakam sistemi (2026-11-05)

**Issue:** yok (#327 zaten düzeltilmiş — aşağıda doğrulandı). Brief'ten en yüksek
etkili hedef seçildi: **`fa` karışık rakam sistemi**. Sahip olunan yollar
`git ls-files 'src/messages/*' 'src/i18n/*' 'src/content/*'` → **6 + 5 + 26 = 37
dosya**; hepsine bakıldı.

### Bulgu (gerçek, canlıda doğrulandı)

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/messages/fa.json` (23 anahtar) | doğruluk/yerelleştirme | Aynı sayfada iki rakam sistemi: `۹۰۶ شرکت پیدا شد` (plural → Farsça) ama `906 ورودی شرکت`, `21 شرکت`, `1 آگهی باز`, `2 موقعیت`, `صفحه 1 از 38` (çıplak `{count}` → Latin) | Tüm sayılar Farsça rakamla | ICU `{x, number}` yalnız *tipli* yer tutucuya uygulanır; çıplak `{count}` ham Latin dizesini geçirir. Canlı `/fa/companies` + `/fa` çıktısında birebir görüldü | düzeltildi: 23 anahtar `{x, number}` (yıl: `::group-off`) |
| 2 | `src/i18n/message-catalogs.test.ts` | ölü kod / eksik ratchet | Farsça rakam kuralı için guard yok | Kural testle sabitlenmeli | Regresyon sessizce geri gelebilir | düzeltildi: yeni test (kırmızı→yeşil kanıtlı) |
| 3 | `src/components/home/{sector-explorer,home-experience}.tsx:79,100,354-361` | mantık/tutarlılık | Bileşen çeviriyi `{ count: "{count}" }` dizesiyle çağırıp sonra `.replace("{count}", …)` yapıyor | Sayıyı gerçek `number` geçir, biçimlendirmeyi ICU'ya bırak | `HomePage.sector*` anahtarları bu yüzden tiplenemiyor (tiplenirse `ناعدد` render eder — kanıtlandı); sayfada Latin rakam kalır | **devredildi** → LANE-TASARIM (issue) |

### Neden 23 anahtar, `HomePage.sector*` hariç

`Footer.rights` yılı `::group-off` ile tiplendi; `{year, number}` Farsça'da
`۲٬۰۲۶` (grup ayraçlı) üretir, telif satırı için yanlış. Diğer 22 anahtar
`{x, number}` ile Farsça rakam üretir ve çağrı yerlerinin hepsi gerçek `number`
geçirir (doğrulandı: `site-footer.tsx:93`, `candidate-profile-form.tsx:783`,
`company-profile-form.tsx:455`, `feedback-form.tsx:49`, `admin/packages/page.tsx:140`,
blog/rehber `readMinutes`). `HomePage.sector*` üçlüsü *ertelenmiş* dize yolu
yüzünden çıplak bırakıldı ve testte açıkça muaf tutuldu.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| ICU sözdizimi (6 dil, tüm yapraklar) | 0 hata |
| Boş değer | 18 (`AdminPackages/AdminContent/JobApplication.messages.idle` × 6 dil) — kasten boş ("mesaj yok") |
| Baştaki/sondaki boşluk | yalnız `CandidateDashboard.completionOf` (`/ {total}` → ` از {total}`), RTL'de doğru; flag yok |
| İç sistem sözlüğü | 0 |
| `en` ile birebir aynı anahtar | tr 7 / ru 7 / el 10 / fa 6 / de 34 — hepsi marka (`İşBul KKTC`, `WhatsApp`, `—`), e-posta, ya da meşru ödünç sözcük (`Website`, `Cookies`, `Email`, `Marketing`, `Famagusta`…) |
| Ölü anahtar | 0 (kaynak taraması: her yaprak referanslı) |
| Legal (#141) | katalog tarafı düzeltilmiş; yalnız `contactEmail` aynı (adres) |
| `fa` içerik dosyaları rakam | Farsça (`guides/fa.ts` → ۱…۶, ۲۰٪) — konvansiyon doğru |

### Doğrulama

- Canlı kanıt: `curl /fa/companies` → `۹۰۶ شرکت پیدا شد` **yanında** `906 ورودی شرکت`.
- Yerel render: `next-intl` `createTranslator("fa")` ile 23 anahtarın hepsi Farsça rakam üretti.
- Ratchet kırmızı→yeşil: `CompanyDirectory.totalLabel` çıplak yapılınca test kırmızı, geri alınca yeşil.
- Kapılar: lint ✅, typecheck ✅, check:frontend-source ✅, test:unit 661/661 ✅.

### Devir

- **LANE-TASARIM (issue):** `sector-explorer.tsx` + `home-experience.tsx`
  ertelenmiş `{count}` dize yolunu bırakmalı; gerçek sayı geçilmeli. O zaman
  `HomePage.{sectorTotalCount,sectorResultCountSingular,sectorResultCountPlural}`
  anahtarları da tiplenebilir (bu lane'in işi) ve test muafiyeti kaldırılır.

## Tur 5 — mikro-denetim: içerik ilçe adı sürüklenmesi (2026-11-06)

**Issue #327 durumu:** çekirdek düzeltme zaten **#345** (merge `6c78a54`) ile
`main`'de. Doğrulandı: `origin/main` `DistrictPage.title = "Stellenangebote in
{district}"`, `JobTypePage.title = "{type}-Stellenangebote"` (issue'nun istediği
gibi); `tests/e2e/seo.spec.ts:201` hâlâ eski `HomeMeta.title`'ı pinliyor ama o
anahtar `HomeMeta` ve `TRNC` içeriyor — bu turda **dokunulmadı** (aşağıda).

Brief'ten en yüksek etkili hedef seçildi: **içerik paketindeki ilçe adı
tutarlılığı**. Sahip olunan yollar `git ls-files 'src/messages/*' 'src/i18n/*'
'src/content/*'` → **6 + 5 + 26 = 37 dosya**; hepsine bakıldı.

### Bulgu (gerçek)

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/content/guides/fa.ts:17` | tutarlılık/yerelleştirme | `...مورفو (Güzelyurt)، تریکومو (İskele) و لفکا (Lefke).` — ilçe adları `تریکومو`, `لفکا` | arayüzün kanonik Farsça seti: `ترکومو`, `لفکه` (`fa.json` ×4 ad alanı, `faq.ts:126`, `site.ts:113/125`) | Farsça yüzeyde ilçe adı iki ayrı çevriyazı sistemine bölünüyordu; rehber sayfası `İskele`'yi `تریکومو` diye adlandırırken filtre/sayfa meta `ترکومو` diyordu | düzeltildi |
| 2 | `src/content/editorial/fa.ts:18` | tutarlılık | `...پیرامون گیرنه و تریکومو.` — aynı `تریکومو` | `ترکومو` | aynı sınıf; editoryal yazı da sürüklenmişti | düzeltildi |
| 3 | `src/i18n/message-catalogs.test.ts` | eksik ratchet | İçerik paketi (`guides`/`editorial`) ilçe adları için guard yoktu; #345 guard'ı yalnız `faq.ts` + `HomeJobSearch.districts`'i görüyordu | içerik paketi de kanonik sete bağlanmalı | sürüklenme sessizce geri gelebilirdi | düzeltildi: yeni test (kırmızı→yeşil kanıtlı, iki regresyon biçimi) |

### Yön kararı (neden `terkumo`/`lafke` değil de arayüz seti)

İki set de Farsça Vikipedi'de bir yere sahip: `تریکومو` ve `لفکا` madde başlığı;
`ترکومو` ve `لفکه` madde değil. Yine de **arayüz seti** seçildi, çünkü:

1. Arayüz seti zaten **kanonik**: `HomeJobSearch.districts` `fa.json`'da 4 ad
   alanında (`CompanyDirectory`, `CandidateDashboard`, `CompanyManagement`,
   `HomeJobSearch`) birebir, `faq.ts` ve `site.ts`'te de aynı. Bir içerik
   dosyasını diğer 7 yüzeyle çelişmek yerine onlara hizalamak tek tutarlı seçenek.
2. #345 tam bu kuralı koydu (`DISTRICT_ALIASES` + FAQ guard'ı) ve fa için
   `ترکومو`/`لفکه`'yi kanonik ilan etti.
3. Vikipedi madde başlıkları Farsça *Vikipedi'nin* yazım tercihidir, site
   arayüzünün değil; site kendi içinde tutarlı olmalı.

### Ratchet (`src/i18n/message-catalogs.test.ts`, 9 test → 10)

- **Yeni:** `getGuides(locale)` + `getArticles(locale)` metni taranır.
  - **Gloss anchor:** `NIKOZYA (Lefkoşa)` biçimindeki her ilçe parantezi,
    parantez öncesi adı kanonik setle (`DISTRICT_ALIASES` dahil) karşılaştırır.
  - **Yasak varyant listesi** (`FORBIDDEN_DISTRICT_VARIANTS.fa`): parantezsiz
    cümlede geçen `تریکومو`/`لفکا`'yı yakalar (editoryal bulgu tam bu biçimdi;
    gloss anchor tek başına kaçırırdı).
- İki regresyon biçimi de enjekte edilerek kırmızı→yeşil kanıtlandı:
  gloss (`guides/fa.ts`) → `fa content glosses "İskele" as "تریکومو", expected "ترکومو"`;
  parantezsiz (`editorial/fa.ts`) → `fa content uses "تریکومو"; the interface uses "ترکومو"`.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Yer tutucu paritesi | tek fark `CompanyDirectory.resultCount` — ru'nun çoğul kümesi meşru |
| ICU sözdizimi (6 dil, tüm yapraklar) | 0 hata |
| İçerik yapı paritesi (guides 3×6, editorial 3×6) | slug/`readMinutes`/başlık sayısı tutarlı |
| İçerik ilçe adı tutarlılığı (6 dil) | fa 2 bulgu düzeltildi; diğer 5 dil temiz |
| Çapraz-dil Türkçe ad sızıntısı (parantezsiz) | 0 |
| İç sistem sözlüğü (içerik + katalog) | 0 (yalnız kod yorumu `import pipeline`, GEO üreticisi `GeoCoordinates` — kullanıcı yüzeyi değil) |
| Baştaki/sondaki boşluk | yalnız `CandidateDashboard.completionOf` (ru/fa), RTL'de doğru |
| Boş değer | 18 (`AdminPackages/AdminContent/JobApplication.messages.idle` ×6) — kasten boş |
| Dışa link (içerik) | 0 (`http(s)://` yok; yalnız test dosyası) |
| SEO uzunluk | 6 dilde başlık >60 / açıklama >165 karakter olan anahtarlar var; çoğu uzun-dil doğal (`de`, `el`) — **bulgu değil, gözlem**, ayrı iş |

### Doğrulama

- Kapılar: lint ✅, typecheck ✅, check:frontend-source ✅, test:unit 675/675 ✅.
- Ratchet kırmızı→yeşil: iki regresyon biçimi de kanıtlandı (yukarıda).
- Arayüz kanonik kanıtı: `fa.json` `HomeJobSearch.districts.iskele = "ترکومو"`,
  `faq.ts:126`, `site.ts:113` birebir.

### Devir

- **`docs/lanes/03-seo.md` / LANE-SEO (gözlem, issue açılmadı):** `de` dahil 5
  dilde `TRNC` İngilizce kısaltması meta metinde geçiyor (`de.json` 8 yer,
  `tests/e2e/seo.spec.ts:201` pinli). Almanca kaynaklar `TRNZ` kullanıyor
  (de Vikipedi: `TRNZ`=10, `TRNC`=3). Ancak bu **diller arası tutarlı bir marka
  tercihi** (tr `KKTC`, en/ru/el/fa/de hepsi kendi kısaltması) ve bir e2e pinini
  kırıyor; bu lane'in kararı değil — LANE-SEO/LANE-QA ile birlikte değerlendirilmeli.
  Kanıt: `de.json` `Meta.description`, `HomeMeta.title/description`,
  `JobsMeta.title`, `JobTypePage.metaTitle/intro/metaDescription`.
