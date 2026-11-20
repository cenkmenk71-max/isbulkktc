# Runbook: Kaynak ilan kataloğu ve sitemap/indeksleme

Bu runbook, "sitemap'te neden bu kadar az ilan var" ve "site aramada neden
çıkmıyor" sorularının operasyonel cevabıdır.

## Katalog nasıl doldurulur

Zamanlanmış workflow `.github/workflows/refresh-source-jobs.yml` günde iki kez
(`04:17` ve `16:17` UTC) çalışır ve `scripts/import-source-jobs.ts`'i çağırır.
Kaynak sitelerden (iskibris, isbulkibris) ilanları çeker, süzer, yazar.

## Kaynak hatasında güvenli yenileme

İçe aktarma iki kaynağın listesini ve gerekli ilan detaylarını **tamamlanmış bir
anlık görüntü** olarak toplar. Kaynaklardan biri erişilemiyorsa, sayfalardan
biri eksik kalıyorsa veya geçici 429/5xx hataları detay yeniden denemelerinden
sonra sürüyorsa işlem Supabase'e yazmadan başarısız olur. Mevcut canlı katalog
korunur; sonraki zamanlanmış çalışma tekrar dener.

Kaynağın tek bir ilan için verdiği kesin 404 ise o ilanın artık mevcut olmadığı
kabul edilir ve yeni katalog anlık görüntüsüne alınmaz. Bu, tüm kaynak API'sinin
erişilememesi veya detay uç noktasının geçici olarak hata vermesiyle aynı
durum değildir.

Yazma aşaması da tek bir `replace_source_job_catalogue` PostgreSQL RPC çağrısıdır.
Şirketler, ilanlar, kaynak eşlemeleri ve değişiklik defteri aynı transaction içinde
değiştirilir. Herhangi bir doğrulama, foreign-key, check constraint veya yazma hatası
tüm değişikliği geri alır; eski katalog ve eski değişiklik defteri birlikte korunur.
RPC yalnızca `service_role` tarafından çağrılabilir ve kendi gövdesinde JWT rolünü
yeniden doğrular.

`--keep-existing` seçeneği artık desteklenmez; bu seçenek atomik tam-katalog
yenilemesiyle çeliştiği için kullanılırsa işlem açık hata verir.

## Kritik: katalog bir üst sınırla kırpılır

`refresh-source-jobs.yml` şu değişkeni geçirir:

```yaml
SOURCE_JOB_LIMIT: ${{ vars.SOURCE_JOB_LIMIT || '21' }}
```

Yani **varsayılan olarak en yeni 21 ilan** yayınlanır. Bu bilinçli bir karardır
(`8df38af` — "cap the source catalogue at the newest 21 listings"); kaynak
sitelerde ~300 canlı ilan olsa bile pano yalnızca 21'ini gösterir. Seçim
`selectDiverseSourceJobs` ile işveren/sektör/çalışma türü çeşitliliği gözetilerek
yapılır, yalnızca tarih sırası değil.

**Sonuç:** sitemap `21 statik grup + 21 ilan` civarı URL yayınlar. Bu bir hata
değildir; yayınlanan katalog neyse sitemap onu dürüstçe listeler.

### Nasıl doğrulanır

```bash
curl -sL https://isbulkktc.com/sitemap.xml | grep -c '/jobs/'
```

Beklenen: `SOURCE_JOB_LIMIT` ile aynı sayı (± yayın penceresi). Farklıysa önce
son refresh koşusunun loguna bakın (Actions → Refresh source jobs).

### Daha fazla ilan yayınlamak (kod değişikliği GEREKMEZ)

Limit bir **repo değişkenidir**, koda gömülü değildir:

1. GitHub → repo → **Settings → Secrets and variables → Actions → Variables**.
2. **New repository variable**: Name = `SOURCE_JOB_LIMIT`, Value = örn. `150`.
3. Sonraki refresh koşusu (veya Actions → Refresh source jobs → **Run workflow**)
   yeni limiti kullanır.
4. Yayından sonra sitemap bir sonraki `revalidate` (≤ 1 saat) ile büyür.

Öneri: ilan sayısı indekslenebilir sayfa sayısını doğrudan artırdığı için
limitin yükseltilmesi arama görünürlüğüne yardımcı olur. Üst sınır 303 civarı
canlı ilandır; 50.000 URL'lik sitemap protokol sınırının çok altındadır.

> Bu değişken yalnızca `refresh-source-jobs.yml`'i etkiler; `ci.yml` ve
> `test:e2e` etkilenmez.

## Yayın penceresi (sitemap'ten düşen ilanlar)

Bir kaynak ilan yalnızca şu koşullarda görünür
(`search_public_jobs` + `toIskibrisRecord`):

- `status = 'published'`
- `published_at <= now()` (gelecek tarihli ilan gizli)
- `expires_at > now()` (süresi dolan ilan gizli)

Yani `expires_at` geçmiş ilanlar otomatik olarak sitemap'ten ve `/jobs`'tan
düşer. Bu doğru davranıştır: ölü sayfalar Google'a sunulmamalı.

## "Google'da çıkmıyor" — kontrol listesi

GA etiketi aramayı **etkilemez**. Sıra:

1. **robots.txt** `/` için `Allow` veriyor mu, sitemap satırı var mı?
2. **Search Console → Sitemaps**: `sitemap.xml` gönderildi mi, kaç URL keşfedildi?
3. **Search Console → URL Denetimi**: ana sayfa için "Dizine eklenmesini iste".
4. **Kapsam raporu**: "Bulundu — dizine eklenmedi" mi, "Taranmadı" mı?
5. Yeni domain için **2–8 hafta** normaldir.
6. Sitemap'teki URL sayısı düşükse bu belgenin "katalog üst sınırı" bölümüne bak.

## İlgili

- `.github/workflows/refresh-source-jobs.yml`
- `scripts/import-source-jobs.ts`
- `src/features/jobs/source-job-import.ts` (`selectDiverseSourceJobs`, `isWithinSourceWindow`)
- `src/server/dal/jobs.ts` (`listPublicJobSitemapEntries`)
- `src/app/sitemap.ts`
