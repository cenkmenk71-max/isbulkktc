# LANE-GEO — Generative Engine Optimization (AI arama/lokal görünürlük)

Hedef: içeriğin **AI arama motorları** (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot) ve **yerel/coğrafi** aramada en iyi görünmesi.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- İş: KKTC (Kuzey Kıbrıs) iş & kariyer platformu. Bölgeler: Lefkoşa, Mağusa/Gazimağusa, Girne, Güzelyurt, İskele, Lefke. 6 dil.
- `src/content/**` içerik kaynağı; `src/app/llms.txt/**` ve `public/llms*` mevcut olabilir (önce incele).

## Sahip olduğun yollar
`src/content/**`, `src/app/llms.txt/**`, `public/llms*`, ve **JSON-LD ÜRETEN
modüller**: `src/features/**/structured-data*.ts`,
`src/features/jobs/job-posting-structured-data.ts`.
**Route dosyalarına (`src/app/[locale]/**`) DOKUNMA** — onların sahibi LANE-SEO.
JSON-LD'nin *şeklini* sen üretirsin; route'a *mount* etmek SEO'nun işidir (isteğini
`docs/lanes/04-geo.md`'ye TODO olarak yaz).

## Yapılacaklar
1. **`llms.txt`:** makine-okunur, güncel site özeti (ne yapar, hangi sayfalar, hangi bölgeler, iletişim). `llms-full.txt` gerekiyorsa ekle.
2. **Yapısal veri (GEO):** `LocalBusiness`/`Organization` (address, geo, areaServed = KKTC bölgeleri, sameAs sosyal), `FAQPage`, `JobPosting`'in `jobLocation` alanı doğru ilçeyle mi.
3. **Bölgesel içerik:** her ilçe için tutarlı terminoloji (Türkçe/İngilizce/Rumca karşılıklar), "Kuzey Kıbrıs" vs "KKTC" tutarlılığı.
4. **AI-alıntılanabilirlik:** net H1/H2 hiyerarşisi, kısa özet cümleleri, tanımlı terimler, `dateModified`, kaynak/atıf blokları.
5. **`sameAs` / entity tutarlılığı:** Google Business, sosyal hesaplar, Wikidata benzeri tutarlı kimlik.
6. **Çok dillilik:** her dilde meta açıklama + anahtar kelime doğal; makine çevirisi kokusu yok.

## Kurallar
- İçerik değişiklikleri **gerçek, doğrulanabilir** bilgiye dayanmalı; uydurma işveren/istatistik yok.
- JSON-LD'yi şema doğrulayıcıyla (schema.org uyumu) kontrol et; `JobPosting` zorunlu alanları tam olsun.
- `check:frontend-source` ve axe erişilebilirlik gate'i yeşil kalmalı.

## Raporla
Eklenen/değişen içerik + yapısal veri örnekleri (JSON-LD parçaları) + hangi AI sorgularında görünürlük beklediğin. Branch + PR, CI yeşil.

---

## Rapor — `dateModified` (lane/geo-date-modified)

**Durum:** PR açık, CI bekliyor.

### Ne yapıldı
`JobPosting`'in `dateModified` alanı artık gerçek bir değişiklik anını taşıyor;
sitemap `lastmod` da aynı değeri kullanıyor (eskiden ikisi de `datePosted`'ı
tekrarlıyordu).

| Kaynak türü | `modified_at` türevi |
|---|---|
| `platform` | `jobs.updated_at` (mevcut `jobs_set_updated_at` trigger'ı) |
| `source_site` | `coalesce(source_updated_at, source_published_at, published_at)` |

- **iskibris** gerçek upstream `updated_at` yayınlıyor → doğrudan güveniliyor.
- **isbulkibris** hiç yayınlamıyor → yeni `job_source_snapshots` içerik-hash
  defteri, `last_changed_at`'i yalnızca görünür içerik gerçekten değişince
  ilerletiyor; dokunulmamış ilan tarihini koruyor (her import'ta yeniden
  damgalanmıyor).
- Her iki yolda da değer `datePosted`'dan önce olamaz (DB constraint + TS
  `resolveJobDateModified`).

### Sahiplik sınırı (dikkat)
Bu iş doğası gereği katmanlar arası olduğu için üç lane'in yoluna dokundu.
Kural 3'e göre bunları **sahibinin onayına** sunuyorum:

- `supabase/**` (migration + pgTAP) → **LANE-SUPABASE**. Canlı DB'ye
  **uygulanmadı**; yalnızca branch'te migration olarak duruyor. Uygulama
  LANE-SUPABASE'in kararı.
- `src/app/sitemap.ts` → **LANE-SEO** (tek satır: `lastModified: job.modifiedAt`).
- `src/features/jobs/job-posting-structured-data.ts` → GEO (bu lane, sahibi).

### TODO (sahiplerine)
- [ ] **LANE-SUPABASE:** `20261024100000_v4_job_modified_at.sql` canlıya
      uygulanmalı. Not: migration `search_public_jobs` / `get_public_job_details`
      gövdelerini **20261021120000** (en güncel tanım) üzerinden yeniden
      kuruyor; 20261021110000 üzerinden kurmak `source_listing_url` ve işveren
      profil alanlarını sessizce düşürür (bu hata bir kez yaşandı, pgTAP
      `jobs_applications_rls` 55-57 yakaladı).
- [ ] **LANE-SEO:** `src/app/sitemap.ts` değişikliği (GEO'dan bağımsızsa) — onay/ret.
