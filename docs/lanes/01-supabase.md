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

## Çalışma günlüğü (2026-11-05)

**Canlı DB erişimi:** `.env.local` bu sandbox'ta yok; `SUPABASE_ACCESS_TOKEN` bir
36 karakterlik UUID (Management API `sbp_` token'ı değil) ve `api.supabase.com`
401 döndürüyor. Docker daemon kapalı, psql yok. Bu yüzden **hiçbir canlı yazma /
okuma yapılmadı**; denetim statik (pglast ile SQL ayrıştırma + dosya okuma)
yürütüldü ve bulgu mantık yürütmeyle kanıtlandı. pgTAP mantığı CI'ın `database`
işine bırakıldı.

**Bulgular (kanıt PR gövdesinde):**

1. **`submit_sales_lead` telefon kısıtı uyuşmazlığı (gerçek hata, düzeltildi).**
   `sales_leads.phone` `between 4 and 32` ister; RPC yalnız üst sınırı
   uyguluyordu (`nullif(left(btrim(_phone),32),'')`). Form + zod şeması 1–32
   karakter kabul ettiği için `"12"` gibi bir değer `23514` ile **tüm lead'i**
   düşürüyordu. Tek idempotent migration ile RPC eşiğin altını boş gibi
   düşürecek biçimde düzeltildi.
2. **`sales_leads` / `submit_sales_lead` sıfır pgTAP kapsamı (düzeltildi).**
   Kardeş tablo `feedback_submissions`'ın suite'i varken bu tablonun yoktu.
   `supabase/tests/database/sales_leads.test.sql` eklendi.
3. **Devredildi (LANE-URUN):** `src/features/sales/schemas.ts` telefonu
   `max(32)` ile kabul ediyor, alt sınır yok — DB tarafı artık düşürüyor ama
   kullanıcıya "geçersiz telefon" geri bildirimi verilmiyor. İstemci tarafı
   sıkılaştırma URUN'un dosyasında.

**Denetim sonucu (hepsi temiz):** 29 `public` tablosunun tamamında RLS açık
(pglast ile `create table` ↔ `alter table ... enable row level security`
karşılaştırması); 29/29 tabloda `revoke` var; son tanımı `SECURITY DEFINER` olan
her fonksiyonda `set search_path = ''` var. `function_privileges.test.sql`
ratchet'i istemci-yürütülebilir imzaları zaten sabitliyor.

## Çalışma günlüğü — 2. tur (2026-11-06)

Bu turda bana atanmış **iki** issue vardı: **#162** (`lane:supabase` +
`lane:auth`, mükerrer kayıt) ve **#139** (`lane:supabase` + `lane:urun` handoff,
anon yazma RPC'lerinde hız sınırı).

**#162 (mükerrer kayıt) — supabase tarafı temiz, AUTH'a devredildi.**
`public.profiles` ↔ `auth.users` 1:1: `handle_new_auth_user()` trigger'ı
`on conflict (id) do nothing` ile idempotent (`20261013000000`, `20261031140000`).
E-posta tekilliği, büyük/küçük harf/artı normalizasyonu ve social↔e-posta
çakışması GoTrue/AUTH katmanının işi (`src/features/identity/**`,
`supabase/config.toml`); DB tarafında yapılacak bir şey yok. Issue'ya yorum +
`lane:auth` etiketiyle devir notu bırakıldı.

**#139 (anon yazma hız sınırı) — düzeltildi (LANE-SUPABASE tarafı).**
Tek idempotent migration: `20261106000000_v4_anon_write_throttle.sql`.
- Yeni tablo `public.anon_write_throttle` (scope, **sha256** subject, pencere
  başlangıcı, sayaç) — ham adres saklanmaz. RLS + `revoke` tam.
- Yeni yardımcı `public.consume_anon_write_quota(scope, subject, burst, window)`:
  tek atomik `insert … on conflict do update` (ilk-kayıt yarışı yok), pencere
  dolunca sıfırlar, bütçe aşılınca **`54000`** fırlatır. `SECURITY DEFINER` +
  `search_path = ''`; istemciye kapalı.
- `submit_feedback` ve `submit_sales_lead` artık insert'ten **önce** bu yardımcıyı
  çağırır: adres (`cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` ilk hop,
  yoksa `unknown`) ve (varsa) gönderen adres için 10 dk / 5 hak —
  `src/features/abuse/limits.ts` ile aynı. Doğrudan PostgREST çağrısı artık
  limiter'ı atlayamaz.
- `supabase/tests/database/anon_write_throttle.test.sql` (14 assertion) eklendi.

Kanıt: `tests/security/sql-hardening.test.ts` ve
`tests/security/anonymous-write-surface.test.ts` migration'ları tarar; ikisi de
yeşil kaldı. pgTAP mantığı Docker olmadığı için CI `database` işinde koşar.

**#139 URUN tarafı:** `anon` grant'i bilinçli korunur (ziyaretçi hesapsız yazabilir);
bu yüzden `src/features/**` tarafında route-proxy (seçenek 2) gerekmez — DB
seçeneği (1) uygulandı. Yine de istemci tarafı için `lane:urun` notu bırakıldı.

**Not (kural):** `docs/threat-model.md` LANE-GÜVENLİK'in dosyası — düzenlenmedi;
#139'a yorum yazıldı.

## Çalışma günlüğü — 3. tur (2026-11-06)

Bana atanmış issue: **#181** (`lane:supabase` + `agent:handoff`) —
`supabase/config.toml`'da **kimlik-bağlama (identity linking) politikası
belirsizdi**. #162'nin "sosyal ↔ e-posta çakışması" kararı bu dosyada.

**Kaynak (resmî):** `supabase.com/docs/guides/auth/auth-identity-linking` +
`.../cli/config`. Doğrulama: `supabase init` ile bu CLI sürümü (2.120.0) için
otoriter `config.toml` üretildi ve anahtar adları oradan + CLI binary'sinden
(`strings`) teyit edildi.

**Karar (kanıt issue'da):**
- **Otomatik bağlama** GoTrue'nun yerleşik davranışı ve **açık kalır**: yalnız
  *doğrulanmış* e-posta eşleşince mevcut hesaba bağlanır → mükerrer kayıt yok,
  hesap devralma da yok. İstenen politika bu.
- **Manuel bağlama** (`linkIdentity()`, farklı adres) → **kapalı**:
  `enable_manual_linking = false`. Hiçbir route `linkIdentity()` çağırmıyor;
  saldırı yüzeyi, arkasında özellik yok. Ayrıca `manual_linking_disabled` hata
  yolu tamamen kapanır.
- Ek olarak **`enable_anonymous_sign_ins = false`** açıkça yazıldı (varsayılan
  zaten `false`; anonim oturum hiçbir yerde kullanılmıyor).

**Denetim sonucu (temiz):**
- 30/30 `public` tablosunda RLS + `revoke`; `SECURITY DEFINER` fonksiyonlarda
  `search_path` sabit; tüm migration'lar pglast ile ayrıştırıldı (0 hata).
- Her tablo ve her public RPC'nin pgTAP kapsamı var (tablo→test haritası PR'da).
- `supabase/` içinde gömülü sır yok (yalnız yorumda `env(SUPABASE_AUTH_CAPTCHA_SECRET)`).
- `minimum_password_length = 10` ↔ `src/features/identity/schemas.ts` `.min(10)` uyumlu.

**Değerlendirilip ertelenenler:** `[auth].enable_signup` ve
`enable_refresh_token_rotation` hâlâ varsayılana bırakılmış (ikisi de güvenli
varsayılan: signup açık, rotasyon açık). #181'in kapsamı yalnız bağlama
politikası olduğu için ek anahtar eklenmedi; gerekirse ayrı iş.

**Canlıya dokunulmadı.** `config push` canlı projeye yazar; bu PR yalnız repo
dosyasını taşır — sahip onayıyla `supabase config push` gerekir.
