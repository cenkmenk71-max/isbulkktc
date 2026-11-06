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
