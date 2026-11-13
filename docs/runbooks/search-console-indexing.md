# Runbook: Search Console + Indexing API

Bu runbook, `isbulkktc.com`'un Google tarafındaki indeksleme yüzeyini **kendi
kaynağından** (Google Search Console API + Indexing API) okuyan ve besleyen iki
araç ile bunların zamanlanmış işini tanımlar. Amaç: "Google'da çıkıyor mu?"
sorusunu `site:` tahmininden değil, Google'ın kendi verdiği cevaptan okumak.

## İki araç, iki iş

| Araç | Ne yapar | Kimlik bilgisi | Zamanlama |
|---|---|---|---|
| `scripts/verify-search-console.mjs` | Search Console durumunu **okur** (property, sitemap, URL denetimi, arama analitiği) | `webmasters` scope | elle / rapor |
| `scripts/submit-indexing.mjs` | JobPosting URL'lerini Indexing API'ye **bildirir** | `indexing` scope | günlük (Actions) |

Ortak kimlik bilgisi çözümü `scripts/google-auth.mjs` içindedir; iki araç da
onu kullanır.

```bash
npm run search-console:verify          # okuma (rapor)
npm run indexing:submit                # bildirim (Actions ile aynı iş)
npm run indexing:submit -- --dry-run   # ne bildirileceğini göster, gönderme
```

## Kimlik bilgisi — iki şekil, tek kural

`scripts/google-auth.mjs` sırayla iki şekli dener:

1. **`GOOGLE_ACCESS_TOKEN`** — kısa ömürlü bearer (`ya29.…`, ~1 saat). Tek
   seferlik elle koşu için. `gcloud auth print-access-token` veya OAuth
   playground'dan alınır. **Zamanlanmış iş için yanlıştır** (bir saat sonra ölür).
2. **`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`** —
   her koşuda taze access token'a çevrilir. Refresh token süresizdir; bu yüzden
   **yalnız zamanlanmış iş bu şekli kullanabilir**.

Hiçbiri yoksa araç **notice basıp exit 0** döner — CI yeşil kalır, sahte kırmızı
yok (`submit-indexnow.yml` ile aynı sözleşme).

> Kimlik bilgisi **asla** loglanmaz. `describeGoogleAuth` yalnız modu ve statik
> token'ın ilk 6 karakterini yazar. Token dosyasını repoya koymayın.

## Zamanlanmış bildirim — `.github/workflows/submit-indexing.yml`

Günde bir (`47 5 * * *`, kaynak-iş tazeleme pencerelerinden sonra) sitemap'teki
`/jobs/<slug>` sayfalarını Indexing API'ye bildirir. Google Indexing API'yi
**yalnız JobPosting (ve BroadcastEvent)** için belgeliyor; araç sitemap'i
`/jobs/<slug>` ile filtreler, başka hiçbir URL'e kota harcamaz.

- **Credential yoksa iş yeşil kalır ve `::warning` basar** — Actions sekmesinde
  yalnız gerçek kırılma kırmızı görünür.
- Sitemap **Vercel alias**'ından okunur (`INDEXING_SITEMAP_ORIGIN`, varsayılan
  `https://isbulkktc-amber.vercel.app`), çünkü kanonik host Cloudflare
  arkasında ve bot koruması veri merkezi çıkışını (GH runner dahil) engeller.
  **Bildirilen URL'ler kanonik kalır** (`--origin https://isbulkktc.com`).
- Günlük kota 200 URL'dir; araç tek koşuda bunu aşmaz, kalanı sonraki koşuya
  bırakır (sitemap zaten hepsini kapsar).

### Sahibin yapması gereken (bir kez)

Refresh token üretip **repository secret** olarak ekle:

1. Google Cloud Console → proje → **APIs & Services → Library**:
   **Indexing API** ve **Search Console API**'yi etkinleştir.
2. **OAuth consent screen** → gerekli scope'lar: `.../auth/indexing` ve
   `.../auth/webmasters`. Test kullanıcısı olarak `info@isbulkktc.com` ekle
   (uygulama "Testing"deyken).
3. OAuth client (Desktop) oluştur → `client_id` / `client_secret`.
4. Tek seferlik consent akışıyla `refresh_token` al (offline access):
   `https://accounts.google.com/o/oauth2/v2/auth?client_id=…&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&access_type=offline&scope=https://www.googleapis.com/auth/indexing%20https://www.googleapis.com/auth/webmasters`
   → kodu `https://oauth2.googleapis.com/token`'a `grant_type=authorization_code`
   ile takas et.
5. GitHub → Settings → Secrets and variables → Actions → **New repository
   secret**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
   (Vercel'e **gerek yok**; bu iş yalnız Actions'ta koşar.)
6. Actions → **Submit job URLs to Google Indexing API** → **Run workflow** →
   logda `Notified N/N job URL(s).`

> Search Console property'si (`sc-domain:isbulkktc.com`) bu OAuth kullanıcısının
> **siteOwner** erişiminde olmalı; değilse okuma aracı `FAIL properties` verir.

## Okuma aracı — dört katman

`verify-search-console.mjs` şunları raporlar ve **yalnız gerçek hatada** exit 1
döner:

| Katman | Ne sorar | Kırmızı olma koşulu |
|---|---|---|
| properties | Kimlik bilgisi hangi property'leri okuyabiliyor, izni ne? | Property listede yok |
| sitemaps | Gönderildi mi, Google indirdi mi, hata/uyarı var mı? | Hata var **veya** hiç sitemap yok |
| inspect | Örnek URL'ler indekste mi, Google'ın canonical'ı bizimkiyle aynı mı? | `FAIL` / `DISALLOWED` / `BLOCKED` / canonical uyuşmazlığı |
| analytics | Pencere içinde tıklama/gösterim/pozisyon | (bilgi — kırmızı değil) |

**`NEUTRAL` ("URL is unknown to Google") `warn`'dır, `fail` değil.** Yeni yayınlanan
bir URL'in henüz indekste olmaması normaldir; onun aracı Indexing API'dir, kırmızı
build değil.

Bayraklar: `--site` (varsayılan `sc-domain:isbulkktc.com`), `--origin`,
`--sitemap-origin` (+ `SEARCH_CONSOLE_SITEMAP_ORIGIN`), `--sample` (varsayılan 6),
`--days` (varsayılan 28).

## Canlı ölçüm (2026-11-12)

```
Search Console audit for sc-domain:isbulkktc.com
  PASS properties  sc-domain:isbulkktc.com (siteOwner); 1 propert(y/ies) readable
  PASS sitemaps    1 sitemap(s), 207 submitted URL(s), last downloaded 2026-11-12T12:56:40.057Z
  PASS inspect     / — Submitted and indexed; canonical https://isbulkktc.com/
  …
  0 failure(s)

Google Indexing API submission for https://isbulkktc.com
  21 job URL(s) selected from 207 sitemap entries.
  Notified 21/21 job URL(s).
```

Detay ve önce/sonra karşılaştırması için `docs/verification-log.md`'ye bakın.

## Regresyon kapısı

Üç test dosyası saf fonksiyonları kilitler ve workflow YAML'ini pinler:
`scripts/google-auth.test.mjs`, `scripts/submit-indexing.test.mjs` (workflow
pinleri dahil), `scripts/verify-search-console.test.mjs`. Koşum:
`node --test scripts/google-auth.test.mjs scripts/submit-indexing.test.mjs scripts/verify-search-console.test.mjs`
(veya `npm run test:unit`).

## İlgili

- `docs/seo/MANUAL_TASKS.md` (§2 Search Console, §6 Indexing API)
- `docs/runbooks/source-job-catalogue.md` ("Google'da çıkmıyor" kontrol listesi)
- `scripts/verify-indexing.mjs` — kimlik bilgisi gerektirmeyen, canlı HTTP
  yüzeyini okuyan kardeş araç (robots/sitemap/hreflang/IndexNow)
- `.github/workflows/submit-indexnow.yml` — Bing/Yandex (Google IndexNow'u yok sayar)
