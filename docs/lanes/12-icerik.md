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
