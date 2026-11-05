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

## Durum (2026-11-05, 3. tur) — micro-denetim: tüm dosyalar

`tests/security/**` (9 dosya), `docs/threat-model.md`, `docs/data-retention.md`
dosya dosya; her boyut (yetki, girdi, sızıntı, mantık, tedarik zinciri, hata
yolu) tek tek sorgulandı. Yeni iki dosya eklendi; bir test yanlış-pozitif'e karşı
sertleştirildi.

- **Yeni: `auth-redirect-boundary.test.ts`.** `/auth/callback` public GET; query
  değerleri saldırgan kontrolünde. `auth-routing.ts`'in "yalnız sabit kelime
  dağarcığı yola dönüşür" sözü 6 testle sabitlendi: `next`/`flow` kapalı enum,
  `sb_flow_id` yalnız 32-küçük-hex, her hedef/hata yolu locale-prefix'li ve
  host-değiştirmiyor. **Bulgu yok** — modül sözünü tutuyor. (QR `next` sınırı
  ayrı: `open-redirect.test.ts`.)
- **Yeni: `ci-workflow-permissions.test.ts` (tedarik zinciri).** `pull_request`
  ile koşan her workflow top-level `permissions:` bildirmeli ve (allowlist'li
  `agent-pr-automation.yml` hariç) `write` içermemeli; hiçbiri
  `pull_request_target` kullanmamalı; auto-merge kapısı `.github/workflows/**`
  değişikliğini hâlâ reddetmeli. **Bulgu yok** — 8/8 workflow en az yetkide.
- **Düzeltilen test kusuru:** `session-cookie-flags.test.ts`'teki blok regex'i
  (`/createServerClient<[\s\S]*?\);/`) yalnız `setAll` geri-çağrısını yakalıyordu;
  `cookieOptions` üçüncü argümanda olduğu için LANE-AUTH düzeltmeyi yapsa bile
  test **yanlış negatif** verecekti. `cookieOptions` bloğunu doğrudan okuyacak
  şekilde değiştirildi + `isHardened` için self-test eklendi. (Bulgu: test
  altyapısı, sahibi bu lane.)
- **Doğrulanan güçlü kontroller (kanıtlı):** `sanitizeNextPath` 81.920 girdilik
  fuzz'da 0 off-origin; 13/13 `admin_*` RPC `has_platform_role` çağırıyor ve
  ikinci (kazanan) tanım `aal2` + aktif profil istiyor; `bun audit --prod` temiz
  (229 paket); hiçbir `dangerouslySetInnerHTML` ham veri basmıyor (JSON-LD `<`
  kaçışlı, GA script sabit); `register_push_subscription` aktif oturum istiyor;
  push/engagement cron bearer'ları sabit-zamanlı değil ama düşük-entropi değil.
- **Devam eden açık bulgular (değişmedi):** #102 `server-only` (LANE-URUN, todo),
  #167 oturum çerezi (LANE-AUTH, todo), #139 anon RPC throttle (todo).
- **Yeni devir (tedarik zinciri):** `package-lock.json` bayat ikinci kilit
  dosyası ve Dependabot'un taradığı **tek** manifest; gerçek `bun.lock` hiç
  taranmıyor. Açık Dependabot alert'i (#4 minimatch) ve `bun audit` (dev) iki
  orta bulgu gösteriyor; `bun audit --prod` temiz, yani üretim çalışma zamanı
  etkilenmiyor. Sahibi LANE-INFRA → **#188** (`agent:handoff`).
- **Bakılmayan:** yok — 9 test dosyasının 9'u, 2 dokümanın 2'si denetlendi.
  `docs/threat-model.md`'ye bu turun iki yeni sınırı (auth callback yönlendirmesi,
  CI izinleri) ve düzeltilen test kusuru işlendi.

## Durum (2026-11-05, 4. tur) — kendi katmanını sertleştirme + throttle kapısı

Bu turda dış yüzeyden çok **kendi test katmanımın dedektörleri** denetlendi:
bir guard'ın regex'i ne kadar dar olursa, koruduğu sınır o kadar delik olur.
Üç gerçek yanlış-negatif bulundu ve düzeltildi; bir `todo` kapıya terfi etti;
bir yeni açık bulgu (throttle'ın app-yolu) devredildi.

- **Bulgu + düzeltme: `client-boundary` env dedektörü yalnız nokta erişimini
  görüyordu.** `process.env.NAME` eşleşiyordu; `process.env["NAME"]`,
  `process.env?.NAME`, `process['env'].NAME`, `const { NAME } = process.env`
  biçimleri **görünmüyordu** — yani bir istemci modülü sır okuyup testi yeşil
  bırakabilirdi. Dedektör beş biçimi de kapsayacak şekilde genişletildi + self-test
  eklendi. Gerçek kodda yeni suçlu çıkmadı (11 dosya, aynı liste) — yani düzeltme
  yanlış-pozitif üretmiyor.
- **Bulgu + düzeltme: `sql-hardening` üç dar regex.** (a) `create table …
  public.([a-z_]+)` rakam-sonekli adı kırpıyordu (`audit_log2` → `audit_log`),
  yani RLS'siz bir tablo görünmezdi; (b) `… \$\$` yalnız `$$` gövdesini görüyordu,
  `$fn$` etiketli gövde görünmezdi; (c) `grant execute … to (anon|authenticated)`
  `grant all on function` ve `grant … to public` biçimlerini atlıyordu. Üçü de
  genişletildi, her biri için self-test eklendi. Mevcut migration'lar zaten temiz.
- **Kapıya terfi: `anonymous-rpc-throttle`'ın `todo`'su.** LANE-SUPABASE
  `20261106000000_v4_anon_write_throttle.sql`'i getirdi: iki RPC de gövdesinde
  `perform public.consume_anon_write_quota(...)` çağırıyor (insert'ten **önce**),
  ledger + helper client rollerinden revoke'lu. Test artık gevşek `/throttle/i`
  yerine **her RPC'nin gövdesinde** throttle çağrısını ve insert'ten önce
  çalıştığını doğruluyor; `todo` kaldırıldı. (Mutation: çağrı silinince kırmızı.)
- **Yeni açık bulgu (devir): throttle'ın IP boyutu app yolunda kollapsıyor.**
  Migration `request.headers` (PostgREST isteğinin başlığı) üzerinden IP
  okuyor; ama Next.js action supabase-js ile çağırıyor ve supabase-js ziyaretçi
  IP'sini **göndermiyor** (kurulu `@supabase/supabase-js` ile ölçüldü: yalnız
  `apikey`, `authorization`, `content-type`, `x-client-info`). Sonuç: tüm
  server-action gönderimleri **tek paylaşılan kovaya** düşer; pencerede altıncı
  meşru gönderim (site geneli) generic "failed" ile reddedilir. Migration'ın
  "eksik başlık tek kovaya düşer" notu app için *normal* durum. Sahibi LANE-URUN
  (`src/features/**`) + LANE-SUPABASE (`supabase/**`) → **#206** (`agent:handoff`);
  test `todo` işaretli.
- **Bakılmayan:** yok — 9 test dosyası + 2 doküman.

## Durum (2026-11-05, 5. tur) — kapı terfileri (main ilerledi)

Bu turda main'e inen iki düzeltme kapıya terfi etti; kalan iki `todo` yürürlükte.

- **Kapıya terfi: oturum çerezi (`session-cookie-flags`).** LANE-AUTH #201 ile iki
  çağrı noktasına `cookieOptions: { httpOnly: true, secure: … }` ekledi; `todo`
  kaldırıldı, test artık sertleştirmeyi zorluyor. (Mutation: `httpOnly: false`
  yapınca kırmızı.) **#167 kapandı sayılır** — sahibi lane issue'yu kapatabilir.
- **Kapıya terfi (önceki tur): anon RPC throttle** — main'e indi (PR #205).
- **Kalan iki açık `todo`:** (a) throttle'ın app-yolu IP kollapsı → **#206**
  (LANE-URUN + LANE-SUPABASE); (b) `unsubscribe-token-core.ts` `server-only`
  eksik → #102 (LANE-URUN).
- **Bakılmayan:** yok — 9 test dosyası + 2 doküman.

## Durum (2026-11-05, 6. tur) — tablo grant/revoke invariantı

Brief'in 1. hedefi "her tablo/fonksiyon/RPC gerçekten kapalı mı?". Fonksiyon yarısı
statik olarak ratchet'liydi; **tablo yarısı hiç korunmuyordu**.

- **Bulgu + düzeltme: tablo revoke'u statik olarak zorlanmıyordu.** Supabase'in
  `pg_default_acl`'i her yeni `public` tabloyu `anon`/`authenticated`'e açar ve
  `revoke ... from public` bu per-role grant'leri **kaldırmaz** (AGENTS.md'de
  fonksiyonlar için belgelenmiş; tablolar için de aynı). Fonksiyonlar
  `function_privileges.test.sql` + `sql-hardening` ratchet'iyle korunuyordu, ama
  bir tablo için `revoke` unutulsa **hiçbir** test kırmızı olmuyordu — oysa
  `threat-model.md` "her tablo revoke'lu" diyordu. `sql-hardening.test.ts`'e
  "every public table is revoked from anon and authenticated" invariantı eklendi
  (virgüllü çoklu tablo listesi destekli) + self-test. Bugün 30/30 tablo temiz.
  (Mutation: revoke'suz bir `create table` eklenince test kırmızı.)
- **Doğrulanan sayılar:** 30 `public` tablo (30/30 RLS + 30/30 revoke), 83
  `security definer` (hepsi `search_path = ''`). `threat-model.md`'deki 29/82
  sayıları düzeltildi.
- **Kalan iki açık `todo`:** #206 (throttle app-yolu IP), #102 (`server-only`).
  #206'nın DB yarısı indi (LANE-SUPABASE `20261106100000`, `x-client-ip`'i
  okuyor) ama app yarısı (action header'ı göndermeli) hâlâ LANE-URUN'da.
- **Bakılmayan:** yok — 9 test dosyası + 2 doküman.

## Durum (2026-11-05, 7. tur) — yönetici guard'ı ve AAL2 ratchet'i

Brief'in 1. hedefini (yetki sınırı) derinleştirdi: `threat-model.md` "13 `admin_*`
RPC'nin tamamı `has_platform_role('platform_admin')` çağırıyor ve o da `aal2`
ister" diyordu — **iddia doğruydu ama hiçbir test zorlamıyordu**.

- **Bulgu + düzeltme: `admin_*` guard'ı ratchet'lenmiyordu.** pgTAP yalnız iki
  paket RPC'sini (`admin_save_job_package`, `admin_assign_company_job_package`)
  sabitliyordu; yeni bir `admin_*` fonksiyonu guard'ı unutsa (üstelik EXECUTE
  whitelist'inde olduğu için istemciden çağrılabilir) hiçbir test kırmızı
  olmuyordu. `sql-hardening.test.ts`'e "every admin_* RPC re-checks the
  platform-admin role in its own body" eklendi: her fonksiyonun **son** gövdesi
  (her migration yeniden oynatılır) yorumlar ayıklandıktan sonra
  `public.has_platform_role('platform_admin')` içermeli. Bugün 13/13 temiz.
- **Bulgu + düzeltme: AAL2 şartı yalnız "kazanan" tanımda ve pinlenmemişti.**
  `has_platform_role` **iki kez** tanımlı: `20261013000000` yalnız `user_roles`'a
  bakıyor, `20261020194000` onu yeniden yaratıp `aal2` + aktif profil şartı
  ekliyor. Yeniden oynatma sırasında ikincisi kazanıyor — ama bunu **hiçbir test
  sabitlemiyordu**. Sonradan gelen bir migration helper'ı basit gövdeyle yeniden
  yaratsa MFA şartı sessizce düşerdi (RPC'ler yine "helper'ı çağırıyor" görünür).
  "the winning has_platform_role body keeps the aal2 and active-profile gate"
  eklendi.
- **Kanıt (mutation):** (a) guard'sız yeni `admin_*` → kırmızı; (b) mevcut bir
  `admin_*`'ı sonradan guard'sız yeniden tanımla → kırmızı (son-tanım kazanır);
  (c) helper'ı `aal2`'siz yeniden yarat → kırmızı.
- **Bakılmayan:** yok — 9 test dosyası + 2 doküman.

## Durum (2026-11-05, 8. tur) — cron rotaları ve unsubscribe sınırı

Brief'in 2. (kimlik) ve 3. (girdi) hedeflerini derinleştirdi: `notification-worker-auth`
yalnız Edge Function'ı sabitliyordu; aynı bearer-deseni kullanan iki **Next.js cron
rotası** ve **unsubscribe uç noktası** hiç test edilmiyordu.

- **Bulgu + düzeltme: iki cron rotası sırasız/guard'sız kalabilirdi.**
  `/api/push/dispatch` ve `/api/email/engagement-digest` public ve service-role
  istemcisi taşıyor; threat model'in "önce kimlik doğrula, sonra yapılandırmayı
  oku" kuralı yalnız Edge Function için pinliydi. `cron-route-auth.test.ts`
  eklendi: her rota (a) sır env'ini okur, (b) bearer karşılaştırmasını
  `createSupabaseServiceClient()`/`isUnsubscribeSigningConfigured()`'tan **önce**
  yapar, (c) `!secret ||` ile fail-closed, (d) sırrı yanıt gövdesine yansıtmaz.
  Bugün ikisi de temiz.
- **Bulgu + düzeltme: unsubscribe uç noktasının sınırı pinlenmemişti.**
  `GET /api/email/unsubscribe` oturumsuzdur ama `service_role` ile yazar. İmza
  service-role istemcisinden **önce** doğrulanmalı, başarı gövdesi önceki opt-out
  durumuna göre dallanmamalı (abonelik oracle'ı), çekirdek sabit-zamanlı olmalı.
  `unsubscribe-route-auth.test.ts` eklendi. Bugün temiz.
- **Kanıt (mutation):** (a) config okumasını bearer'dan öne al → cron testi
  kırmızı; (b) `!secret ||` guard'ını kaldır → fail-closed testi kırmızı;
  (c) service client'ı imza doğrulamasından öne al → unsubscribe testi kırmızı.
- **Bakılmayan:** yok — 11 test dosyası + 2 doküman. Kalan iki `todo` yürürlükte
  (#206 throttle app-yolu IP, #102 `server-only`).

## Durum (2026-11-05, 9. tur) — yanıt başlıkları kapısı

Brief'in 4. hedefi (sızıntı) ve genel sertleştirme: `next.config.ts` bu uygulamanın
CSP/HSTS/`X-Frame-Options` vb. başlıkları **tanımladığı tek yer** ve hiçbir lane'in
test katmanı onu pinlemiyordu — bir refactor bir başlığı düşürse veya CSP
`script-src`'i genişletse **tüm kapılar yeşil kalırdı**.

- **Bulgu + düzeltme: güvenlik başlıkları hiç test edilmiyordu.**
  `security-headers.test.ts` eklendi. **Metin grep'i değil**: gerçek
  `next.config.ts` import edilir, `headers()` Next.js'in çağırdığı gibi çağrılır
  ve dönen başlıklar doğrulanır. Kontroller: (a) global grupta dokuz savunma
  başlığının tamamı doğru değerle var; (b) CSP'nin yüksek-değer direktifleri
  (`default-src`/`base-uri`/`object-src`/`frame-ancestors`/`form-action` +
  `upgrade-insecure-requests`); (c) `script-src` wildcard/bare-scheme/`unsafe-eval`
  içermez; (d) `poweredByHeader === false`; (e) Vercel alias grubu
  `noindex, nofollow`.
- **Kanıt (mutation):** (a) HSTS'i zayıflat (`max-age=0`) → kırmızı;
  (b) `script-src`'i `'self' https:`'e genişlet → kırmızı; (c) `poweredByHeader`'ı
  `true` yap → kırmızı.
- **Not:** `next.config.ts` hiçbir lane'in sahiplik tablosunda yok; bu test onu
  **yalnız okur**, yazmaz — sahiplik ihlali yok.
- **Bakılmayan:** yok — 12 test dosyası + 2 doküman. Kalan iki `todo` yürürlükte
  (#206 throttle app-yolu IP, #102 `server-only`).

## Durum (2026-11-05, 10. tur) — çerez SameSite bayrağı

Brief'in 2. hedefi (kimlik): `session-cookie-flags.test.ts` oturum çerezinin
`HttpOnly` + `Secure` bayraklarını pinliyordu ama **`SameSite`'i değil** — oysa
çerezi siteler-arası isteklerden uzak tutan (CSRF savunması) bayrak odur.

- **Bulgu + düzeltme: `SameSite` pinlenmemişti.** `@supabase/ssr` varsayılanı
  `sameSite: "lax"` (`node_modules/@supabase/ssr/dist/main/utils/constants.js`);
  iki çağrı noktası da açıkça `"lax"` geçiyor. Ama `isHardened` yalnız
  `httpOnly`/`secure`'e bakıyordu: ikisini de `sameSite: "none"`'a çevirmek
  **hiçbir testi kırmıyordu** (kanıtlandı) — CSRF savunması sessizce kaldırılabilirdi.
  `isHardened` artık `sameSite: "lax"|"strict"` şartını da arıyor; self-test
  `sameSite: "none"`'u sertleştirilmiş saymıyor.
- **Bulgu + düzeltme: OAuth sign-up intent çerezi pinlenmemişti.**
  `startOAuthSignIn` bu çerezi aynı yanıtta yazar ve callback'in güvendiği
  locale/audience'ı taşır; `createServerClient` kontrolü onu görmez. Aynı bayraklar
  (`httpOnly`/`sameSite`/`secure`) için ayrı test eklendi.
- **Kanıt (mutation):** (a) oturum çerezini `sameSite: "none"` yap → kırmızı;
  (b) intent çerezini `sameSite: "none"` yap → kırmızı.
- **Bakılmayan:** yok — 12 test dosyası + 2 doküman. Kalan iki `todo` yürürlükte
  (#206 throttle app-yolu IP, #102 `server-only`).

## Durum (2026-11-05, 11. tur) — push endpoint SSRF'i

Brief'in 3. hedefi (girdi: SSRF/dosya/yol manipülasyonu) ilk kez derinlemesine
tarandı; **gerçek ve daha önce bildirilmemiş bir SSRF** bulundu.

- **Bulgu: kayıtlı push endpoint'i üzerinden SSRF.** `POST /api/push/subscriptions`
  ile oturum açmış bir ziyaretçi `endpoint`'e **herhangi bir `https://` URL**
  yazabilir (tek kontrol: `url().min(12).max(1024).startsWith("https://")`; aynısı
  `register_push_subscription`'da). Cron worker (`/api/push/dispatch` →
  `sendPushMessage` → `web-push`) o URL'ye **sunucudan** POST eder; **host
  allowlist'i yok**, loopback/link-local/RFC1918/metadata engelli değil.
- **Kanıt (ölçüldü):** gerçek `web-push` istemcisiyle yerel bir TCP dinleyicisine
  karşı `endpoint = "https://127.0.0.1:<port>/internal-only"` → **1 bağlantı,
  1568 bayt TLS ClientHello**. Yani kayıtlı endpoint worker'ı iç ağdaki keyfî bir
  adrese bağlatıyor (kör SSRF + erişilebilirlik yoklaması).
- **Yeni test + devir:** `tests/security/push-endpoint-ssrf.test.ts` (bulguyu `todo`
  olarak belgeler; allowlist gelince kapıya terfi eder — self-test'te doğrulandı).
  Sahibi LANE-URUN (`src/features/**`, `src/server/push/**`) + LANE-SUPABASE
  (`supabase/**`) → **#262** (`agent:handoff`).
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Diğer iki `todo` yürürlükte
  (#206 throttle app-yolu IP, #102 `server-only`).

## Durum (2026-11-05, 12. tur) — SSRF kapısındaki ikinci yazma yolu

Bir önceki turda eklediğim SSRF testini kendi katmanım açısından denetledim:
`push-endpoint-ssrf.test.ts` yazma yollarını **dosya adıyla** listeliyordu, oysa
endpoint'i kaydeden **iki** yol var.

- **Bulgu + düzeltme: kendi guard'ım ikinci yazma yolunu kaçırıyordu.**
  `src/features/pwa/actions.ts` `savePushSubscription` de
  `register_push_subscription`'ı çağırıyor ve aynı zayıf `endpoint` kontrolünü
  (`url().min(12).max(1024).startsWith("https://")`) kullanıyor — ama test yalnız
  `app/api/push/subscriptions/route.ts`'i tarıyordu. Test artık yazma yollarını
  **dosya adıyla değil** `register_push_subscription` çağrısından keşfediyor;
  yeni bir yazar sessizce kaçamaz (self-test: üçüncü bir yazar eklenince kırmızı).
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #262 (SSRF
  allowlist), #206 (throttle app-yolu IP), #102 (server-only).

## Durum (2026-11-05, 13. tur) — throttle sırası (varlık değil)

Threat model'in "form throttle'ı RPC'den **ve** mail'den önce çalışır" iddiasını
test ettim: `anonymous-rpc-throttle.test.ts`'teki ilgili test adı "before it calls
the RPC" diyordu ama yalnız `RateLimiter.check(` **varlığını** arıyordu.

- **Bulgu + düzeltme: sıra zorlanmıyordu, yalnız varlık.** Throttle bloğunu RPC
  çağrısının **arkasına** taşıyan bir mutasyon testi **yeşil bırakıyordu** — yani
  satır yazılıp mail gittikten sonra limiter'a bakılsa bile test geçerdi; limiter
  hiçbir şeyi sınırlamazdı. Test artık `indexOf` ile **gerçek sırayı** doğrular:
  throttle çağrısı hem `supabase.rpc("submit_…")`'dan hem mail fan-out'undan
  (`sendFeedbackEmails`/`sendSalesLeadEmails`) önce gelmeli.
- **Kanıt (mutation):** throttle'ı RPC'den sonraya taşı → kırmızı
  (`… calls the RPC before it throttles …`).
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #262, #206,
  #102.

## Durum (2026-11-05, 14. tur) — SSRF kapısı (todo → kapı)

LANE-URUN + LANE-SUPABASE #262'yi **düzeltti** (#273): `isAllowedPushEndpoint`
(`src/server/push/push-endpoint.ts`) yalnız bilinen push-servis host'larını kabul
eder; IP literal / decimal-IP / `localhost` / `.local`/`.internal` reddedilir. Her
iki yazma yolu (route + `savePushSubscription`) ve gönderim ucu onu çağırır.

- **Kapıya terfi:** `push-endpoint-ssrf.test.ts` artık bir `todo` değil, **kapı**.
  Test yeniden yazıldı: allowlist'i **gerçek fonksiyonla** sürer (kabul edilen push
  host'ları; loopback/RFC1918/metadata/decimal-IP/local adresleri **reddedilir**),
  her yazarın `refine(isAllowedPushEndpoint…)` ile bağladığını ve sink'in
  `sendNotification`'dan **önce** kontrol ettiğini sabitler.
- **Kanıt (mutation):** (a) bir yazardan `refine(isAllowedPushEndpoint…)`'i kaldır →
  kırmızı; (b) sink'teki allowlist kontrolünü kaldır → kırmızı; (c) allowlist
  fonksiyonunun kendisi artık loopback/metadata'yı reddediyor (test bunu sürüyor).
- **#262 kapatılabilir.** Kalan `todo`'lar: #206 (throttle app-yolu IP),
  #102 (server-only).
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman.
