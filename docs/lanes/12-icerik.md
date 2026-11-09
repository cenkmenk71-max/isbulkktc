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

## Tur 6 — mikro-denetim: tr hitap kipi sürüklenmesi + #384 kapanışı (2026-11-06)

**Issue:** #384 (agent:content, lane:icerik) — açık, sahiplenildi ve kapatıldı.
Ayrıca `tr` kayıt (register) tutarlılığı tarandı. Sahip olunan yollar
`git ls-files 'src/messages/*' 'src/i18n/*' 'src/content/*'` → **6 + 5 + 26 = 37
dosya**; hepsine bakıldı (aşağıda `src/content/ai-visibility/geo-audit.test.ts`
ve `interface-catalog.ts` LANE-GEO üretimi, dokunulmadı).

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/messages/fa.json:676-679` | doğruluk/yerelleştirme (#384) | `sectorTotalCount`/`sectorResultCountSingular`/`sectorResultCountPlural` çıplak `{count}` → `/fa`'da `…: 16` (Latin) | `{count, number}` → `…: ۱۶` | Aynı sayfada iki rakam sistemi; PR #383 kodu gerçek sayı geçiriyor, katalog geride kalmış | düzeltildi |
| 2 | `src/messages/tr.json:953` `CandidateDashboard.notificationsDescription` | tutarlılık/hitap kipi | "Başvuru durumun değiştiğinde ve **sana** bir mesaj geldiğinde haberdar ol." — 2. tekil | Ürünün her yeri 2. çoğul (`-iniz`, `siz`) | Aynı bildirim metninin kendi resmî eşi `Install.pushBody` (satır 44) "… durumunuz değiştiğinde … haberdar olun." diyor; aynı okuyucuya iki ayrı hitap | düzeltildi → "… durumunuz değiştiğinde ve size bir mesaj geldiğinde haberdar olun." |
| 3 | `src/messages/tr.json:1097` `CompanyManagement.notificationsDescription` | tutarlılık/hitap kipi | "Yeni bir başvuru geldiğinde ve adaylardan mesaj aldığında haberdar ol." — 2. tekil | 2. çoğul | #2 ile aynı sınıf | düzeltildi → "… aldığınızda haberdar olun." |

### Ratchet (`src/i18n/message-catalogs.test.ts`, 10 test → 11)

- **Yeni:** `INFORMAL_SECOND_PERSON` — tr katalogda belirgin 2. tekil işaretleri
  (`sen` ailesi, `-yorsun`, `-acaksın/-eceksin`, `-abilirsin/-ebilirsin`,
  `-malısın/-melisin`, `-dığın/-diğin`) yasaklar. Buton etiketindeki yalın emir
  kipi ("Kaydet", "Giriş yap") **flag'lenmez** — yalnız kesin tekil işaretleri.
  `\b` yerine `\p{L}` lookaround kullanıldı: Türkçe harfler (`ı`, `ğ`, `ş`)
  `\w` değildir, `\b` kelime ortasında eşleşir (yanlış pozitif üretir).
- `FA_DEFERRED_PLACEHOLDERS` muafiyeti ve `HomePage.sector*` istisna yorumu
  **silindi** (#384 istediği gibi): kod artık gerçek sayı geçirdiği için
  `{count, number}` doğru render eder.
- İki ratchet de regresyon enjekte edilerek kırmızı→yeşil kanıtlandı:
  `tr.notificationsDescription`'a `sana` geri konunca →
  `tr.CandidateDashboard.notificationsDescription uses the informal singular "sana"`;
  `fa.sectorTotalCount` çıplak yapılınca →
  `fa.HomePage.sectorTotalCount interpolates {count} without a number format`.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Gerçek yer tutucu paritesi (`IntlMessageFormat` AST) | 0 uyumsuz |
| ICU sözdizimi (6 dil, tüm yapraklar) | 0 hata |
| `plural` dalları `other` içeriyor mu | 0 eksik |
| Hitap kipi — tr 2. tekil | 2 bulgu düzeltildi; kalan eşleşmeler resmî/3. şahıs (yanlış pozitif, elendi) |
| Hitap kipi — de/ru/el/fa resmî | `du`/`ты`/`εσύ`/`تو` = 0 (hepsi Sie/вы/εσείς/شما) |
| `en` ile birebir aynı nesir anahtarı (tr/ru/el/fa/de) | 0 |
| Boş değer | 18 (`Admin{Packages,Content}` + `JobApplication.messages.idle` ×6) — kasten boş |
| Baştaki/sondaki boşluk | yalnız `CandidateDashboard.completionOf` (ru/fa) — RTL/doğal, flag yok |
| HTML/`javascript:` enjeksiyonu | 0 (yalnız `HomePage.title` zengin metin `<line>`/`<accent>`, 6 dilde aynı etiket kümesi) |
| Belirsiz/suçlayıcı hata, çıplak "sonuç yok" | 0 |
| İç sistem sözlüğü (içerik + katalog) | 0 |
| İçerik yapı paritesi (guides 3×6, editorial 3×6) | slug/section/`readMinutes` tutarlı |
| Dışa link (içerik) | 0 |
| `src/content/ai-visibility/{geo-audit.test.ts,interface-catalog.ts}` | **bakılmadı** — LANE-GEO üretimi |

### Doğrulama

- Kapılar: lint ✅, typecheck ✅, check:frontend-source ✅, test:unit 695/695 ✅.
- `fa` render kanıtı: `createTranslator("fa")` ile üç anahtar `count:16` → `۱۶`.
- İki ratchet kırmızı→yeşil (yukarıda).

### Devir

- **#327** (de landing H1) ve **#141** (Legal meta/gövde) çekirdek düzeltmeleri
  `main`'de doğrulandı: `de` `DistrictPage.title`/`JobTypePage.title` Almanca,
  Legal blokları yalnız `Legal.contactEmail` paylaşıyor. #141'in **seed** kısmı
  (`supabase/seed-managed-content.sql`, `legal.*` + `faq_entries`) hâlâ bu lane'in
  dışında → LANE-SUPABASE.
- **#189** (e-posta şablonları marka kimliği) sahibi LANE-AUTH/LANE-GEO/URUN;
  bu lane yalnız metin sağlar, kod tarafı devredildi (mevcut issue yeterli).

## Tur 7 — mikro-denetim: #399 tr "münhal" + "iş ilanı" pleonazmı (2026-11-06)

**Kanıt (TDK).** `münhal` = boş kadro / açık pozisyon (bir *durum*); `iş ilanı` =
bir işin duyurulduğu *ilan metni*. Aynı cümlede yan yana gelince aynı kavram iki
kez söylenir → pleonazm ("açık pozisyon ilanı"). 10 tr anahtarı bu çifti taşıyordu.

### Bulgular (tr.json) — dosya:satır, önce → sonra

| # | Anahtar | Satır | Önce (pleonazm) | Sonra | Etki |
|---|---|---|---|---|---|
| 1 | `Meta.title` | 3 | `İşBul KKTC — KKTC ve Kuzey Kıbrıs …` | `İşBul KKTC — Kuzey Kıbrıs …` | `KKTC` tekrarı (marka + bölge) |
| 2 | `Meta.description` | 4 | `…ilanlarını, münhalleri ve…` | `…ilanlarını ve…` | pleonazm |
| 3 | `HomeMeta.description` | 57 | `…iş ilanları, münhal ve…` | `…iş ilanları ve…` | pleonazm |
| 4 | `JobsMeta.title` | 224 | `KKTC Güncel İş İlanları ve Münhaller` | `KKTC Güncel Münhaller` | pleonazm; `münhal` SEO terimi (#190) korunur |
| 5 | `JobsMeta.description` | 225 | `…ilanlarını ve münhalleri…` | `…ilanlarını…` | pleonazm |
| 6 | `HomePage.title` | 663 | `<line>münhal ve kariyer</line>` | `<line>kariyer ve gelişim</line>` | pleonazm |
| 7 | `DistrictPage.metaTitle` | 1424 | `{district} İş İlanları ve Münhaller \| KKTC` | `{district} İş İlanları \| KKTC` | pleonazm |
| 8 | `DistrictPage.metaDescription` | 1425 | `…münhal ve kariyer…` | `…ve kariyer…` | pleonazm |
| 9 | `DistrictPage.intro` | 1426 | `…ve münhalleri…` | `…` (yalnız ilanlar) | pleonazm |
| 10 | `JobTypePage.metaDescription` | 1436 | `…iş ilanları ve münhaller…` | `…iş ilanları…` | pleonazm |
| 11 | `JobTypePage.intro` | 1437 | `…ve münhalleri…` | `…` (yalnız ilanlar) | pleonazm |

`JobsMeta.title` bilerek `münhal` tutar: `kktc münhal` #190'un **birincil** anahtar
kelimesi; kaybedilirse arama görünürlüğü düşer. Artık `iş ilanı` ile çift değil.

### Boyut taraması (AUDIT.md)

| Alan | Sonuç |
|---|---|
| Doğruluk / anlam (pleonazm) | 11 bulgu, 11 düzeltildi (yukarıda) |
| Yazım — düz `'` ile Türkçe ek | 21 (`Kuzey Kıbrıs'taki` vb.) — **mevcut evrensel kural**, her dosyada düz kesme; bulgu değil |
| Yazım — kıvrık `’` ile Türkçe ek | 25 — aynı kuralın kıvrık kanadı; karışık ama tutarlı-çift, bulgu değil |
| Noktalama — noktalama öncesi boşluk / çift boşluk | 0 |
| Yinelenen sözcük (`\b(\p{L}{3,})\s+\1\b`) | 0 (tek "eşleşme" yanlış pozitif: "İsterseniz öneriyi") |
| Parantez dengesi | 0 |
| Marka tutarlılığı (`İşBul KKTC` yazımı) | 0 ihlal |
| Placeholder paritesi (6 dil) | `{district}`/`{type}`/`{year}`/`{count}` hepsi korundu |
| İç sistem sözlüğü (yasak liste) | 0 |
| `src/content/**` (guides/editorial/ai-visibility tr) | 0 pleonazm; `src/content/ai-visibility/{geo-audit.test.ts,interface-catalog.ts}` **bakılmadı** — LANE-GEO üretimi |
| Diğer 5 dil (en/de/ru/el/fa) | `jobs and vacancies` / `Stellenangebote und Jobs` vb. — **dilsel olarak doğal** (İngilizce/Almanca'da iki terim ayrı kayıt türü); sahip talebi tr kapsamında; bulgu değil, gözlem |

### Ratchet

`src/i18n/message-catalogs.test.ts` — yeni test: `münhal` ile `iş ilan` aynı
yaprakta geçemez. Kırmızı→yeşil kanıtlı: `Meta.description`'a pleonazm enjekte
edilince `✖ …: Meta.description`, geri alınınca `✔`. (Dil-bağımsız: `tr`
haritası üzerinde çalışır, `toLocaleLowerCase("tr")`.)

### Doğrulama

- Kapılar: lint ✅, typecheck ✅, check:frontend-source ✅, test:unit 705 ✔ / 0 ✖
  (4 `⚠` todo = #367 pini, bu lane'in dışı), test:security ✅, test:integration ✅.
- **E2E (CI'da):** 1/4, 2/4 ✅; 3/4, 4/4 ❌ — kırmızı **yalnız** bayat pinlerden
  (aşağıdaki devir). "Received" değeri yeni metni birebir doğruluyor; üretilen
  içerik doğru.

### Devir (agent:handoff → LANE-QA)

`tests/**` LANE-QA'nın (sahiplik tablosu); İÇERİK oraya yazmaz. 4 e2e pinini
güncellemek gerekir (yoksa e2e kırmızı). Hepsi `tests/**` altında LANE-QA'ya
aittir (yalnız `accessibility.spec.ts` TASARIM'a bırakılmış):

| Dosya:satır | Eski pin | Yeni değer |
|---|---|---|
| `tests/e2e/jobs.spec.ts:25` | `/KKTC Güncel İş İlanları ve Münhaller/` | `/KKTC Güncel Münhaller/` |
| `tests/e2e/seo.spec.ts:634` | `${district.tr} İş İlanları ve Münhaller` | `${district.tr} İş İlanları` |
| `tests/e2e/seo.spec.ts:16` | `…güncel iş ilanları, münhal ve kariyer fırsatları. İş ilanlarını…` | `…güncel iş ilanları ve kariyer fırsatları. İlanları…` |
| `tests/e2e/home.spec.ts:74` | `KKTC iş ilanları, münhal ve kariyer fırsatları tek yerde.` | `KKTC iş ilanları, kariyer ve gelişim fırsatları tek yerde.` |

`tests/e2e/home.spec.ts` LANE-QA'ya aittir; `jobs/seo.spec.ts` de `tests/**`
altında LANE-QA'ya aittir (yalnız `accessibility.spec.ts` TASARIM'a bırakılmış).
Ek gözlem: `src/features/identity/auth-metadata.test.ts:8` bir **yorumda** eski
`Meta.title`'ı örnek gösteriyor (assertion değil) — LANE-AUTH dosyası, metin
güncelliği için not.

### Rapor (00-orchestration formatı)

```
Lane: icerik            Branch: lane/icerik            PR: #407
Değişen dosyalar: src/messages/tr.json, src/i18n/message-catalogs.test.ts,
  docs/lanes/12-icerik.md
Çalıştırılan kontroller:
  lint -> pass | typecheck -> pass | check:frontend-source -> pass
  test:unit -> 705 pass / 0 fail | test:security -> pass | test:integration -> pass
  e2e (CI) -> 1/4,2/4 pass; 3/4,4/4 fail (yalnız bayat pinler; devir #408)
  database (CI) -> pass
Canlıya dokundu mu: hayır
Sahibin yapması gerekenler: (1) #408 pin düzeltmesini lane/icerik'e ekle (ya da
  LANE-QA PR'ını bu PR ile birlikte merge et) — aksi halde required check yeşile
  dönmez; (2) PR #407'i merge et.
Sonraki lane için notlar: `tests/**` = LANE-QA; metin değişince e2e pinlerini
  İÇERİK güncellemez, devreder. `münhal` #190 SEO terimi olarak JobsMeta.title'da
  tek başına kalır.
```


## Tur 8 — mikro-denetim: #469 `NEXT_LOCALE` çerezi production'da `Secure` değil (2026-11-09)

**PR:** (bu PR) · **Issue:** #469 (devir, LANE-GÜVENLİK → LANE-İÇERİK) · **Branch:** `lane/icerik`

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/i18n/routing.ts` (`defineRouting`) | yetki/gizlilik | `localeCookie` verilmemiş → next-intl varsayılanı `{name:'NEXT_LOCALE', sameSite:'lax'}`, **`Secure` yok** | production'da `Secure` | HTTPS-only sitede (HSTS `includeSubDomains; preload`) her belge navigasyonunda yazılan çerez tek istisnaydı; uygulamanın diğer tüm çerezleri (`sb-*`, `ib_oauth_signup_intent`, `ib_consent`) production'da `Secure` | düzeltildi → `localeCookie: { secure: process.env.NODE_ENV === 'production' }` |

### Kök neden / doğrulama

`receiveRoutingConfig` (`node_modules/next-intl/dist/esm/production/routing/config.js`)
seçeneği varsayılanla **birleştirir**: `{name:'NEXT_LOCALE', sameSite:'lax', ...localeCookie}`.
Yani `secure` **tek başına** yeterlidir; `name`/`sameSite` varsayılanda kalır. Aynı
`localeCookie` nesnesi **istemci yazımında da** kullanılır (`createNavigation(routing)`
→ `BaseLink` → `syncLocaleCookie`, `document.cookie`), yani bayrak her iki yolda da
uygulanır.

`HttpOnly` **eklenmedi** (bilinçli): dil değiştirici çerezi `document.cookie` ile
yazıyor, `HttpOnly` istemciden kurulamaz — ayrı bir refactor gerektirir, #469 kapsamı dışı.

### Kanıt (kırmızı→yeşil)

**Yeni gerçek kapı (bu lane'in dosyası):** `src/i18n/routing.test.ts` — `NODE_ENV=production`
ile `src/i18n/routing.ts` taze import edilir ve **gerçek middleware** sürülür; çerezde
`Secure` aranır. Düzeltme geçici kaldırılınca test **kırmızı**, geri konunca **yeşil**
(kanıtlandı). Bu bir `todo` değil, düz assertion: regresyon CI'ı düşürür.

`tests/security/locale-cookie-flags.test.ts` "in production the locale cookie is Secure"
ise `{ todo }` idi — bir `todo` testi **başarısız olsa da todo sayılır**, yani regresyonu
yakalayamaz. Bu yüzden LANE-GÜVENLİK'in todo'yu kaldırıp gerçek kapıya terfi ettirmesi
gerekir (aşağıda devir).

### Boyut taraması (AUDIT.md, seçilen düzeltmeye uygulandı)

| Alan | Sonuç |
|---|---|
| İç sistem sözlüğü (6 dil katalog) | 0 eşleşme (kaynak veri/ilan, senkron, veritabanı, koordinat, şube sayısı) |
| Sayı + iç terim | 0 (`locationCount` "{count} şube", `activeJobCount` "{count} açık ilan" — ziyaretçinin gördüğü şube/ilan sayısı, iç metrik değil) |
| Boş durum dili | 0 kusur dili (hepsi "bulunamadı / deneyin / göz atın") |
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| İçerik (`src/content/**`) | 0 yeni sızıntı (`llms-brief`'in GEO'ya devri yürürlükte) |
| #327 (de landing H1) | `main`'de zaten düzeltilmiş — `de.DistrictPage.title` Almanca doğrulandı, bulgu kapalı |

### Kapılar

lint ✅ · typecheck ✅ · check:frontend-source ✅ · test:unit 865 pass / 0 fail ✅

### Devir

- **LANE-GÜVENLİK** (`tests/security/**` sahibi): `locale-cookie-flags.test.ts`
  içindeki `{ todo: "LANE-İÇERİK: …" }` artık gereksiz → todo kaldırılıp gerçek kapıya
  terfi ettirilmeli; `cookie-inventory.test.ts` §6 tablosundaki "no Secure — open
  finding" satırı "Secure (prod)" olarak güncellenmeli. Kanıt: bu PR.
- **LANE-SUPABASE:** `supabase/seed-managed-content.sql` (#141) hâlâ bu lane'in dışı.

## Tur 9 — mikro-denetim: #418 §6 çerez politikası pazarlama kategorisini belgelemiyor (2026-11-09)

**PR:** (bu PR) · **Issue:** #418 §6 (çerez denetimi; sahibin en öncelikli maddesi) · **Branch:** `lane/icerik`

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/messages/{tr,en,ru,el,fa,de}.json` → `Legal.cookies.sections.s2` | doğruluk/gizlilik | Politika yalnızca **analitik** çerezi anlatıyordu ("Analitik çerezler" başlığı, tek paragraf GA) | Banner'ın sunduğu **her** onay kategorisini adıyla belgelemeli | Banner iki kategori sunuyor (`analytics`, `marketing`); `/cookies` sayfası `marketing`'i hiç anmıyordu. Ziyaretçi, politikada adı geçmeyen bir şeye onay veriyordu → KVKK/GDPR şeffaflık açığı | düzeltildi |

### Kök neden

`src/components/analytics/consent.ts` → `consentCategories = ["analytics", "marketing"]`.
Banner her ikisini de toggle olarak sunar ve `marketing` kararı **gerçek bir sinyali**
sürer: `src/components/analytics/google-analytics.tsx:45-47` içinde `ad_storage`,
`ad_user_data`, `ad_personalization` üçü de `consent.marketing`'e bağlı. Yani
"pazarlama" soyut bir etiket değil, yüklenen bir çerez sınıfı. Politika metni ise
yalnız `analytics`'i tarif ediyordu — s2 başlığı "Analitik çerezler", gövdesi tek
paragraf GA. İki yüzey (banner kategorileri ↔ politika metni) **kod düzeyinde
bağlı değildi**, bu yüzden sessizce ayrıştı.

### Düzeltme

`s2` başlığı "Analitik **ve pazarlama** çerezleri" oldu; `p1`'e pazarlama/`reklam`
çerezlerinin **yalnızca o kategoriye onay verildiğinde** etkinleştiği eklendi; `p2`
"bir kategoriden birine onay vermezseniz ilgili betik veya çerez hiç yüklenmez"
biçiminde kategori-genel hâle getirildi (tek kategori varsayımı kaldırıldı). 6 dilin
hepsinde, dilin doğal sözcükleriyle (kelime kelime çeviri değil).

### Kanıt (ratchet — kırmızı→yeşil)

**Yeni gerçek kapı (bu lane'in dosyası):** `src/i18n/message-catalogs.test.ts` —
"the cookie policy documents every consent category the banner offers". Test,
kategori listesini **`consentCategories` modülünden okur** (sabit liste değil), her
kategoriyi 6 dilde politika metninde arar. `consentCategories`'e bir kategori eklenirse
o kategori 6 politikanın hepsinde belgelenmeden CI yeşile dönemez.

Kategori etiketi kısa bir isimdir ("Аналитика") ama politika farklı dilbilgisel biçim
ister ("Аналитические cookie"), bu yüzden eşleşme etiketin birebir kendisiyle değil,
dile özgü **gövde (stem)** ile yapılır (ru `аналит`/`маркет`; diğer 5 dil etiketle
birebir). Düzeltme geçici bozulunca (`en` s2'den "marketing" çıkarıldı) test **kırmızı**,
geri konunca **yeşil** (kanıtlandı).

### Boyut taraması (AUDIT.md, seçilen düzeltmeye uygulandı)

| Alan | Sonuç |
|---|---|
| Doğruluk (politika ↔ gerçek çerez) | 1 bulgu, düzeltildi (yukarıda) |
| Yetki/şeffaflık (onay ↔ belge) | Banner kategori kümesi artık politikaya ratchet'li |
| İç sistem sözlüğü (6 dil katalog) | 0 eşleşme |
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Placeholder paritesi | korundu (s2'de placeholder yok) |
| Erişilebilirlik/kontrast/RTL | metin değişikliği; yeni renk/ikon yok, `fa` RTL akışı etkilenmez |
| #327 (de landing H1) | `main`'de düzeltilmiş (`de.DistrictPage.title` = "Stellenangebote in {district}"), bulgu kapalı |
| #399 (tr pleonazm) | `main`'de düzeltilmiş; `tr.json`'da `münhal`+`iş ilanı` çifti kalmadı (ratchet testi yeşil) |

### Kapılar

lint ✅ · typecheck ✅ · check:frontend-source ✅ · test:unit 887 pass / 0 fail (2 todo) ✅

### Devir

- **LANE-TASARIM** (`src/components/analytics/**` guard'ları): kategori kümesi
  değişirse (yeni bir onay kategorisi) bu lane'in ratchet'i kırmızıya döner — yeni
  kategoriyi 6 politikada da belgelemek bu lane'in işi; haber verin. Kanıt: bu PR.
- **LANE-GÜVENLİK:** `cookie-inventory.test.ts` §6 tablosundaki `NEXT_LOCALE`
  satırındaki "no Secure — open finding" artık #498 ile kapandı → "Secure (prod)"
  olarak güncellenmeli (Tur 8 devri hâlâ geçerli).

## Tur 10 — mikro-denetim: #418 §6 gizlilik politikası pazarlama çerezlerini belgelemiyor (2026-11-09)

**PR:** (bu PR) · **Issue:** #418 §6 (çerez denetimi; sahibin en öncelikli maddesi) · **Branch:** `lane/icerik`

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/messages/{tr,en,ru,el,fa,de}.json` → `Legal.privacy.sections.s2.p2` | doğruluk/gizlilik | Gizlilik politikası yalnız **analitik** çerezden söz ediyordu ("...analitik çerezler kullanırız...") | Banner'ın sunduğu **her** onay kategorisini adıyla belgelemeli | Tur 9 `/cookies` sayfasını düzeltti ama **gizlilik politikası** — birincil hukuki belge — aynı onay yüzeyini tarif ediyor ve hâlâ yalnız analytics'i anıyordu. Ziyaretçi, gizlilik politikasında adı geçmeyen `marketing` kategorisine onay veriyordu → KVKK/GDPR şeffaflık açığı | düzeltildi |

### Kök neden

`src/components/analytics/consent.ts` → `consentCategories = ["analytics", "marketing"]`.
Banner her ikisini de toggle olarak sunar ve `marketing` kararı **gerçek bir sinyali**
sürer: `src/components/analytics/google-analytics.tsx:45-47` içinde `ad_storage`,
`ad_user_data`, `ad_personalization` üçü de `consent.marketing`'e bağlı. İki hukuki
belge (`/cookies` ve `/privacy`) aynı onay yüzeyini tarif eder. Tur 9 (`#501`) yalnız
`Legal.cookies.sections.s2`'yi düzeltti; `Legal.privacy.sections.s2.p2` düzeltilmeden
kaldı. İki yüzey arasında **kod düzeyinde bir bağ yoktu**, bu yüzden biri düzeltilirken
diğeri sessizce geride kaldı.

### Düzeltme

`Legal.privacy.sections.s2.p2` artık hem analitik hem pazarlama çerezini adıyla anıyor
("...analitik çerezler, ilgi alanınıza uygun içerik ve reklam için pazarlama
çerezleri kullanırız..."). 6 dilin hepsinde, dilin doğal sözcükleriyle (kelime kelime
çeviri değil). Cümle, ziyaretçinin kendi seçimini anlatıyor ve mevcut "reddedebilir /
tercihinizi değiştirebilirsiniz" güvencesini koruyor.

### Kanıt (ratchet — kırmızı→yeşil)

**Yeni gerçek kapı (bu lane'in dosyası):** `src/i18n/message-catalogs.test.ts` —
"the privacy policy documents every consent category the banner offers". Ortak
yardımcı `assertPolicyNamesConsentCategories(locale, policyLabel, policyKeys)` hem
çerez (Tur 9) hem gizlilik politikasını **aynı** `consentCategories` listesine bağlar;
kategori listesi modülden okunur, sabit değil. `consentCategories`'e bir kategori
eklenirse o kategori iki belgenin de 6 dilinde belgelenmeden CI yeşile dönmez.
`en` gizlilik `s2.p2`'sinden "marketing" çıkarılınca test **kırmızı**
(`en privacy policy never names the "marketing" category…`), geri konunca **yeşil**
(kanıtlandı).

### Boyut taraması (AUDIT.md, seçilen düzeltmeye uygulandı)

| Alan | Sonuç |
|---|---|
| Doğruluk (politika ↔ gerçek çerez) | 1 bulgu, düzeltildi (yukarıda) |
| Yetki/şeffaflık (onay ↔ belge) | İki hukuki belge artık banner kategori kümesine ratchet'li |
| İç sistem sözlüğü (6 dil katalog) | 0 eşleşme (kaynak veri/ilan, senkron, veritabanı, koordinat, şube sayısı) |
| Anahtar paritesi (6 dil) | 0 eksik/fazla |
| Placeholder paritesi | korundu (s2.p2'de placeholder yok) |
| ICU sözdizimi / JSON round-trip | 6/6 birebir (dosya başına 1 satır değişti) |
| Erişilebilirlik/kontrast/RTL | metin değişikliği; yeni renk/ikon yok, `fa` RTL akışı etkilenmez |
| #327 (de landing H1) | `main`'de düzeltilmiş (`de.DistrictPage.title` = "Stellenangebote in {district}") |
| #399 (tr pleonazm) | `main`'de düzeltilmiş; `tr.json`'da `münhal` 0 eşleşme (ratchet yeşil) |
| #469 (`NEXT_LOCALE` Secure) | `main`'de düzeltilmiş + `locale-cookie-flags.test.ts` gerçek kapıya terfi etmiş (#502) |

### Kapılar

lint ✅ · typecheck ✅ · check:frontend-source ✅ · test:unit 893 pass / 0 fail (2 todo) ✅

### Devir

- **LANE-TASARIM** (`src/components/analytics/**`): `consentCategories` değişirse iki
  ratchet de kırmızıya döner — yeni kategoriyi iki belgenin de 6 dilinde belgelemek bu
  lane'in işi; haber verin. Kanıt: bu PR.
- **LANE-SUPABASE:** `supabase/seed-managed-content.sql` (#141) hâlâ `legal.*` satırlarını
  yalnız Türkçe tutuyor ve gizlilik/çerez metnini de içeriyor → bu düzeltmenin canlı
  etkisi seed yeniden üretilene kadar sınırlı. `supabase/**` bu lane'in dışında.

### Rapor (00-orchestration formatı)

```
Lane: icerik            Branch: lane/icerik            PR: (bu PR)
Değişen dosyalar: src/messages/{tr,en,ru,el,fa,de}.json,
  src/i18n/message-catalogs.test.ts, docs/lanes/12-icerik.md
Çalıştırılan kontroller:
  lint -> pass | typecheck -> pass | check:frontend-source -> pass
  test:unit -> 893 pass / 0 fail (2 todo) | e2e -> CI'da | database -> CI'da
Canlıya dokundu mu: hayır
Sahibin yapması gerekenler: PR'ı merge et; seed (#141) yeniden üretilmeli (LANE-SUPABASE)
Sonraki lane için notlar: iki hukuki belge (privacy + cookies) artık ortak kategori
  ratchet'ine bağlı; kategori eklenirse ikisi de güncellenir.
```
