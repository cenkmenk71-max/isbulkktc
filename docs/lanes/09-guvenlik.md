# LANE-GÜVENLİK — tehdit modeli & saldırgan testler

Sistemin sınırlarını **düşman gözüyle** sınayan lane. Görevi açık bulmak ve
kanıtlamak; düzeltmek sahibi lane'in işidir (görev ayrılığı — denetçi kendi
bulgusunu düzeltmez).

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`.
- `tests/security/**` **şu an BOŞ** (yalnız `.gitkeep`). Bu katman sıfırdan kurulacak.
- Bilinen yüzey: Supabase RLS + `service_role`, auth oturumları, Turnstile,
  e-posta şablonları, Edge Function'lar, Vercel/Cloudflare edge, push (VAPID).

## Sahip olduğun yollar
`tests/security/**`, `docs/threat-model.md`, `docs/data-retention.md`

Başka hiçbir dosyaya yazmazsın. Bir açık bulduğunda düzeltmezsin: sahibi lane'e
issue açar, kanıtı (istek/yanıt, sorgu, ekran) ekleyip `agent:blocked` ile
işaretlersin.

## Hedef
1. **Yetki sınırları:** `anon`/`authenticated` ile erişilmemesi gereken her
   tablo/fonksiyon/RPC gerçekten kapalı mı? (İmza bazlı liste, pozitif ve
   negatif test.)
2. **Kimlik:** oturum sabitleme, çerez bayrakları, token sızıntısı, MFA atlatma,
   hesap devralma yolları.
3. **Girdi:** SQL enjeksiyonu, yol/URL manipülasyonu, dosya yükleme, SSR/CSRF,
   açık yönlendirme (`next`/`redirect` parametreleri).
4. **Sızıntı:** hata mesajları ve loglar PII/sır taşıyor mu? `service_role`
   anahtarı istemciye gidiyor mu?
5. **Tedarik zinciri:** bağımlılık denetimi (`bun audit`), kilit dosyası, CI
   izinleri en az yetki mi?

## Kurallar
- **Yalnız kendi ortamına/test verisine saldır.** Canlıya yönelik yük/DoS veya
  izinsiz erişim yok; bu bir denetim, saldırı değil.
- Her bulgu için: tekrar adımı, gözlenen, beklenen, etki, önerilen düzeltme.
- Bulguyu **kanıtlamadan** raporlama; "olabilir" değil "şu istek şunu döndürdü".
- `main`'e push YOK; `lane/guvenlik` dalı + PR.
- Skill: `security`, `code-review`.

## Durum (2026-11-05) — micro-denetim turu

Brief "tests/security/** BOŞ" diyor; artık değil. Katman 6 dosya ve `static` CI
işinde `bun run test:security` adımı olarak koşuyor (`package.json` +
`.github/workflows/ci.yml` = LANE-INFRA). Bu turda yapılanlar:

- **Kapıya terfi:** `open-redirect.test.ts` iki `todo`'su düzeltildi
  (`sanitizeNextPath` çıktıyı yeniden doğruluyor), `anonymous-write-surface`
  form kontrolü testi de `todo`'dan kapıya geçti (`src/features/abuse/**`).
- **Yeni bulgu + kanıt:** `tests/security/anonymous-rpc-throttle.test.ts`.
  `submit_feedback` / `submit_sales_lead` `anon`'a grant'li ve `security definer`;
  hız sınırı yalnız server action'da, yani RPC'nin üstünde. Doğrudan
  `POST /rest/v1/rpc/submit_feedback` çağıran limiter'ı atlar → tablolara sınırsız
  satır. Mail gönderilemez (fan-out action'da). Sahibi: LANE-SUPABASE (DB
  throttle) + LANE-URUN. `todo` işaretli, issue açıldı.
- **Kanıtla kapatıldı:** 13/13 `admin_*` RPC `has_platform_role` çağırıyor;
  83 `security definer` jetonunun 5'i yorum (guard regex'i temiz);
  `getAppBaseUrl` host header'a güvenmiyor (env'e bağlı, HTTPS zorunlu).
- **Değişmeyen açık bulgu:** `unsubscribe-token-core.ts` `server-only` eksik
  (LANE-URUN, #102).

## Durum (2026-11-05, 2. tur) — kimlik boyutu

Önceki tur yetki sınırı, sızıntı ve girdi boyutlarını taradı; bu tur **kimlik**
boyutuna (çerez bayrakları, oturum sabitleme) odaklandı.

- **Yeni bulgu + devir:** oturum çerezi `@supabase/ssr` varsayılanlarıyla yazılıyor
  (`httpOnly: false`, `Secure` yok); iki çağrı noktası da (`src/proxy.ts`,
  `src/server/db/supabase-server.ts`) `cookieOptions` geçmiyor. Tarayıcıda çerezi
  okuyan kod olmadığı için `HttpOnly` güvenle eklenebilir. Sahibi LANE-AUTH →
  **#167** (`agent:handoff`). Kanıt: `tests/security/session-cookie-flags.test.ts`.
- **Doğrulanan güçlü kontrol:** proxy `auth.getClaims()` ile imza doğruluyor
  (ham `getSession()` değil); tarayıcıda `createBrowserClient` yok. İkisi de test
  ile sabitlendi.
- **Devir kuralı:** bu turdan itibaren başka lane'in dosyasındaki bulgu
  `agent:handoff` + `lane:<ad>` ile açılıyor (önceki #139 elle düzeltildi);
  `agent:blocked` yalnız insan gerektiren tıkanma için.
