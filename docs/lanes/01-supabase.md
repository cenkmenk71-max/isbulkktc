# LANE-SUPABASE — veritabanı & RLS & şema (TEK canlı DB yazarı)

Sen bu programda **canlı Supabase veritabanına yazma yetkisi olan TEK chat'sin.**
Diğer lane'ler SQL'i sadece branch'te taşır. Bu yüzden disiplinli ol.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Önce oku: `AGENTS.md`, `docs/lanes/00-orchestration.md`, `docs/lanes/00-orchestration.md`.
- Hosted proje: **`uwmhquvzbilbfzdrlxmb`** (ap-south-1). `.env.local` (gitignored) canlı publishable + service_role anahtarlarını tutar.
- **Migration takibi `supabase_migrations.schema_migrations` DEĞİL, özel `public._applied_migrations` tablosudur.** Bu yüzden `db push` her şeyi yeniden çalıştırır → **mevcut RPC'leri yeniden kullan, yeni migration ekleme.** `search_public_jobs` imzası: `(_query, _district, _job_type, _workplace_mode, _page)`.
- Katalog akışı: `scripts/import-source-jobs.ts` (canlı yazar, `--limit=N` / `SOURCE_JOB_LIMIT`). `job_source_imports` + `jobs(publication_source='source_site')` + `companies(slug like 'source-%')`.

## Sahip olduğun yollar (sadece bunlar)
`supabase/**` — yani `supabase/migrations/**`, `supabase/tests/**`, `supabase/seed*.sql`,
`supabase/config.toml`. **`supabase/templates/**` (şablon içeriği) LANE-AUTH'a ait** —
ona dokunma, ihtiyacı raporla.

## Hedef: nokta noktasına sağlamlık
1. **RLS denetimi:** Her `public.*` tablosunda RLS açık mı? Politikalar en az yetkiyle mi? `service_role` dışında kim ne okuyabiliyor?
2. **pgTAP kapsamı:** kritik RPC'ler (`search_public_jobs`, `get_public_*`) ve RLS için testler var mı, eksik olan var mı?
3. **İndeksler:** `jobs(status, published_at desc)`, `jobs(publication_source)`, `job_source_imports(job_id)`, `companies(slug)` üzerinde gerekli indeksler mevcut mu (EXPLAIN ile doğrula)?
4. **Kısıtlar:** slug/title/description uzunluk kısıtları import script'inin ürettiği değerlerle uyumlu mu?
5. **Yetim veri:** `companies` referanssız kalan `source-%` kayıtları, `job_source_imports` eşlemesiz job'lar.

## Kurallar
- **Yeni migration eklemeden önce sor:** mevcut migration sistemi nedeniyle riskli. Önce mevcut şemayı RPC'lerle test et, eksikleri raporla, gerekirse **tek** yeni idempotent migration öner ve sahibin onayını al.
- pgTAP testleri **seed'den bağımsız** olmalı (AGENTS.md'deki kural: `job_source_imports` + `source_site` jobs + `source-%` companies temizliği transaction başında).
- Canlıya yazmadan önce **daima `--dry-run`/SELECT** ile doğrula. Silme işlemlerinde önce say.
- Docker bu sandbox'ta çalışmaz → `test:db` burada koşamaz; SQL'i CI'a bırak, mantığı SELECT'lerle kanıtla.

## Raporla
Kural ihlali/eksik listesi + önerilen tek migration + pgTAP testi. Branch + PR aç, CI yeşil olsun.
