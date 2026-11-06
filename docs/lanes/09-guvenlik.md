# LANE-GÜVENLİK — tehdit modeli & saldırgan testler

Sistemin sınırlarını **düşman gözüyle** sınayan lane. Görevi açık bulmak ve
kanıtlamak; düzeltmek sahibi lane'in işidir (görev ayrılığı — denetçi kendi
bulgusunu düzeltmez).

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`.
- `tests/security/**` katmanı **kuruldu** (15 dosya; `bun run test:security` `static` CI işinde). Bu dosya o katmanın durumunu tutar — aşağıya bak.
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

## Durum (2026-11-05, 15. tur) — görsel optimizasyon allowlist'i

`next.config.ts`'i bir kez daha taradım; `security-headers.test.ts` başlıkları
pinliyordu ama **`images.remotePatterns`** (sunucu tarafı görsel-fetch allowlist'i)
**pinlenmiyordu**.

- **Bulgu + düzeltme: görsel optimizasyon allowlist'i testsizdi.**
  `images.remotePatterns`, Next.js'in `/ _next/image` optimizasyonunda sunucunun
  hangi host'lardan görsel çekebileceğini belirler; çok geniş bir desen
  (`hostname: "**"`) optimizasyonu bir SSRF/DoS vekiline çevirir. Hiçbir test onu
  denetlemiyordu — yeni bir `**` host tüm kapılar yeşilken yayınlanabilirdi.
  `security-headers.test.ts`'e iki test eklendi: (a) her desen **tam bir https host
  + `protocol: "https"` + bir `pathname`** olmalı (wildcard host reddedilir);
  (b) hiçbir desen private/loopback/metadata (`.local`/`.internal` dâhil) host'a
  işaret etmemeli.
- **Kanıt (mutation):** (a) `hostname: "**"` ekle → kırmızı; (b) `hostname:
  "169.254.169.254"` yap → kırmızı; (c) bir desenden `protocol: "https"`'i kaldır →
  kırmızı.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #206, #102.

## Durum (2026-11-05, 16. tur) — service-role RPC rol guard'ı

`public` şemasındaki **`service_role`'e grant'li, istemci rollerine kapalı** 8
fonksiyonu taradım: 6'sı gövdesinde `auth.role()` kontrolü yapıyor, **2'si
yapmıyor**.

- **Bulgu: `list_engagement_recipients` ve `opt_out_engagement` gövde-içi rol
  guard'ı taşımıyor.** Birincil kontrol (`revoke … from public, anon,
  authenticated`) yerinde ve pgTAP'te sabit; ama ikinci savunma hattı yok. Bir gün
  `anon`/`authenticated`'e EXECUTE yanlışlıkla geri verilirse (bu depoda oldu),
  `list_engagement_recipients` (tam mailing-list dump'ı: `user_id`, `email`,
  `display_name`, `locale`) açık verir — diğer altısı `auth.role()` ile
  fail-closed davranır.
- **Yeni ratchet + devir:** `sql-hardening.test.ts`'e "every service-role-only RPC
  re-checks auth.role() in its own body" eklendi (`todo`). Ratchet, `service_role`'e
  grant'li her imzanın **son** gövdesini (migration'lar yeniden oynatılır) okur,
  yorumları ayıklar ve `auth.role() <> 'service_role'` / `= 'service_role'` arar.
  İki fonksiyon guard'lanınca `todo` kaldırılıp kapıya terfi eder (doğrulandı).
  Sahibi LANE-SUPABASE → **#298** (`agent:handoff`).
- **Kanıt (mutation):** (a) iki fonksiyona guard eklenince ratchet **yeşile**
  döner; (b) guard'lı üçüncü bir RPC (`finish_notification_email`) guard'ını
  kaybedince ratchet **kırmızı** olur.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-05, 17. tur) — CI job-level izin bloğu

Kendi `ci-workflow-permissions.test.ts`'imi denetledim: `pull_request` ile koşan
her workflow'un `permissions:` bloğunu okuyordu ama **yalnız top-level** bloğu.

- **Bulgu + düzeltme: job-level `permissions:` bloğu kaçırılıyordu.** GitHub'da bir
  job kendi `permissions:` bloğuyla top-level'ı **geçersiz kılar**; `ci.yml`'deki
  bir job'a `permissions: { contents: write }` eklemek testi **yeşil bırakıyordu**
  (kanıtlandı) — yani bir lane, izlediği token'ı sessizce genişletebilirdi. Test
  artık **her** `permissions:` bloğunu (top-level ve girintili job-level) tarar.
- **Kanıt (mutation):** `static` job'ına `permissions: contents: write` ekle →
  kırmızı (`unexpected write permission: ci.yml [contents: write]`); geri alınca
  yeşil. Self-test: iki bloklu bir YAML'da job-level yazma bloğunun görüldüğünü
  doğrular.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-05, 18. tur) — istemci→sunucu import biçimleri

Kendi `client-boundary.test.ts`'imi denetledim: "no client component imports a
`@/server` module" testi yalnız **statik** `from "@/server/…"` biçimini
yakalıyordu.

- **Bulgu + düzeltme: dinamik `import()` ve `require()` görünmüyordu.** Bir
  `"use client"` modülü sunucu kodunu `await import("@/server/…")` veya
  `require("@/server/…")` ile de çekebilir; eski regex ikisini de **kaçırıyordu**
  (kanıtlandı: üç biçimden yalnız `from` yakalanıyordu). `importsServerModule()`
  artık üç biçimi de görür; self-test her birini doğrular.
- **Kanıt (mutation):** `"use client"` bir scratch modül `await
  import("@/server/email/mailer")` içerince test **kırmızı** oldu; eski regex'te
  aynı mutasyon **yeşil** kalıyordu.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-05, 19. tur) — `/_next/image` yerel allowlist'i (#324)

`lane:guvenlik`'e devredilen **#324**'ü aldım: `/_next/image?url=<göreli yol>`
görsel olmayan içerik döndürüyordu (`%2Fblog` → HTML, `%2Fapi%2Fbuild-info` →
JSON, `%2Fllms.txt` → text). `next.config.ts` sahipsiz ve onu bu lane denetlediği
için düzeltme bende.

- **Kök neden:** `images.localPatterns` yoktu; Next göreli bir `url`'yi sunucuda
  fetch edip o rotanın içeriğini döndürüyordu. Next 16 dokümanına göre
  `localPatterns` tam da bunu kapatır.
- **Düzeltme (`next.config.ts`):** `localPatterns: [{pathname:"/images/**",
  search:""},{pathname:"/logos/**",search:""}]`. Uygulamanın optimize ettiği tüm
  yerel görseller bu iki önektedir; statik import'lar `/_next/static/media/**`'a
  çözülür ve Next onu ayrıca allowlist'ler (etkilenmez). `search:""` sorgu dizeli
  görsel yolunu da reddeder (Next 16'nın işaret ettiği enumeration yüzeyi).
- **Kanıt (uçtan uca):** throwaway `NEXT_DIST_DIR` ile production build →
  standalone server → curl: `%2Fblog`, `%2Fabout`, `%2Fcontact`, `%2Fapi%2Fbuild-info`,
  `%2Fllms.txt`, `%2Ffeed.xml`, `%2F.well-known%2Fsecurity.txt`, `%2Frobots.txt` →
  hepsi **400**; `/images/Girne.webp` ve bir `/logos/*.webp` → **200 image/***;
  `/images/Girne.webp?v=1` → **400**.
- **Yeni test:** `security-headers.test.ts` Next'in **kendi** `hasLocalMatch`
  matcher'ını sürer — gerçek görsel yolları kabul, 18 görsel-olmayan yolu ve
  sorgu dizelini reddet; allowlist yokken her yolun kabul edildiğini doğrulayan
  self-test. (Mutation: `localPatterns`'ı kaldır → kırmızı.)
- **#324 kapatılabilir.** Kalan `todo`'lar: #298, #206, #102.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman.

## Durum (2026-11-06, 20. tur) — `create table` biçim varyantları

Kendi `sql-hardening.test.ts`'imi denetledim: RLS ve tablo-revoke testleri tabloları
`create table` biçimiyle arıyordu.

- **Bulgu + düzeltme: `unlogged`/`temporary` tablolar görünmüyordu.**
  Postgres `create unlogged table public.x` / `create temp[orary] table public.x` /
  `create global temporary table public.x` biçimlerini kabul eder; eski matcher
  (`create\s+table`) bunları **kaçırıyordu** (kanıtlandı: yalnız düz biçim
  yakalanıyordu). Böyle bir tablo RLS'siz ve revoke'suz yayınlanıp iki testi de
  yeşil bırakabilirdi. Tek bir `createdTablePattern` (isteğe bağlı
  `global temporary|temporary|temp|unlogged` niteleyicisi) hem RLS hem revoke
  testinde kullanılıyor; self-test dört biçimi de doğrular.
- **Kanıt (mutation):** scratch `create unlogged table public.probe_unlogged` →
  hem RLS hem tablo-revoke testi **kırmızı**; eski matcher'da ikisi de yeşil
  kalırdı.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 21. tur) — `search_path` pin doğruluğu

`sql-hardening.test.ts`'teki `search_path` denetimini inceledim: `/set\s+search_path\s*=\s*''/`
idi.

- **Bulgu 1 (yanlış negatif):** `set search_path = '' , public` **geçiyordu** —
  yani pin gerçekte boş değil, `public` hâlâ yolda. Böyle bir definer fonksiyon
  hijack'e açık kalır ama test onu "pinli" sayardı.
- **Bulgu 2 (yanlış pozitif):** `set search_path to ''` — `TO`, `SET` için geçerli
  bir eşanlamlı — **tanınmıyordu**; doğru yazılmış bir fonksiyon "pinlenmemiş"
  diye işaretlenirdi.
- **Düzeltme:** tek bir `pinnedSearchPath` =
  `/set\s+search_path\s*(?:=|\bto\b)\s*''(?![ \t]*,)/i` — hem `=` hem `to`'yu kabul
  eder, ardından virgülle başka şema gelirse reddeder. Self-test altı biçimi
  doğrular; 84 gerçek definer fonksiyonun tamamı geçer (regresyon yok).
- **Kanıt (mutation):** `set search_path = '' , public` yazan scratch definer →
  **kırmızı** (eskiden yeşildi); `set search_path to ''` yazan → **yeşil** (eskiden
  yanlış-pozitif).
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 22. tur) — `/_next/image` çift-kodlama atlatması (#356)

`lane:guvenlik`'e devredilen **#356**'yı aldım: #324 düzeltmem bir fazla
yüzde-kodlama ile hâlâ atlatılıyordu.

- **Bulgu:** matcher yolu **kodlanmış** hâliyle görür (`URL.pathname` `%25`'i
  korur), optimizer'ın fetch katmanı ise bir kez daha **çözer**. `/images/**`
  düz öneki `/images/%252e%252e/blog`'a `true` der ama fetch `/blog`'a gider →
  **200 HTML** (kanıtlandı; matcher'a doğrudan girdiyle ve uçtan uca curl ile).
- **Düzeltme (`next.config.ts`):** desenler artık **görsel uzantısı** şart koşar —
  `/images/**/*.@(webp|png|jpg|jpeg|avif|svg)` ve `/logos/**/…`. Kodlanmış
  traversal hiçbir gerçek görsel yoluna benzemez ve hiçbir rota görsel uzantısıyla
  bitmez (doğrulandı), bu yüzden atlatma kapanır. Gerçek görseller (`webp/jpg/
  jpeg/png`) ve `/logos/*.webp` çalışmaya devam eder.
- **Kanıt (uçtan uca, production standalone):** `%252e%252e`, `%25252e%25252e`,
  `%2e%2e`, `../` varyantları → **400**; `/images/Girne.webp`, `about-hero.webp`,
  `homepage-metal-feature-strip.png`, `/logos/*.webp` → **200 image/***; sorgu
  dizeli görsel → **400**.
- **Yeni testler:** `security-headers.test.ts` — kodlanmış traversal reddi +
  "her yerel desen bir görsel uzantısı şart koşar" self-test'i. (Mutation: düz
  `/images/**`'a dön → ikisi de kırmızı.)
- **#356 kapatılabilir.** Kalan `todo`'lar: #298, #206, #102.
- **Bakılmayan:** yok — 13 test dosyası + 2 doküman.

## Durum (2026-11-06, 23. tur) — Turnstile (captcha) kablolaması

Auth yüzeyini tararken captcha kablolamasını denetledim: `readCaptchaToken` form
alanını okuyup Supabase çağrısına `options: { captchaToken }` olarak geçiriyor,
ama **hiçbir test bunu sabitlemiyordu**.

- **Bulgu: captcha kablolaması pinlenmemişti.** Dört captcha-korumalı akış (giriş,
  kayıt, doğrulama yeniden gönder, şifre sıfırlama) token'ı okuyup Supabase'e
  geçirir. Token **isteğe bağlı** olduğu için (Supabase koruma kapalıyken eksik
  token'ı kabul eder) kablolamanın sessizce kopması **başka hiçbir testi kırmaz** —
  yani captcha tüm auth formlarında sessizce devre dışı kalabilirdi.
- **Yeni test:** `auth-captcha-wiring.test.ts` — dört akışın da token'ı
  Supabase çağrısına geçirdiğini (dengeli argüman bloğu çıkarımıyla), her akışın
  token'ı widget alanından okuduğunu ve `readCaptchaToken`'ın alan adının
  `turnstileResponseField` ile aynı olduğunu doğrular.
- **Kanıt (mutation):** bir akıştan `captchaToken`'ı kaldır → kırmızı; alan adını
  `cf-turnstile-token` yap → kırmızı.
- **Bakılmayan:** yok — 14 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 24. tur) — `/sw.js` no-cache (#364)

`lane:guvenlik`'e devredilen **#364**'ü (edge audit tur-14, SW-01) aldım: `/sw.js`
origin'de `max-age=0, must-revalidate` dönüyor ama Cloudflare edge bunu **30 güne**
yükseltiyor; yeni bir service worker (`CACHE_VERSION` artışı) PWA kullanıcısına
günlerce ulaşmıyor.

- **Düzeltme (`next.config.ts`):** `headers()`'a `/sw.js` için
  `Cache-Control: no-cache, no-store, must-revalidate` kuralı eklendi. `no-cache`
  edge'i her istekte revalidate etmeye zorlar; böylece zone'un Browser Cache TTL
  ayarından bağımsız çalışır. Diğer public varlıklar (`/robots.txt` vb.) değişmedi.
- **Kanıt (uçtan uca, production standalone):** `curl -I /sw.js` →
  `Cache-Control: no-cache, no-store, must-revalidate`; `/robots.txt` hâlâ
  `public, max-age=0, must-revalidate`.
- **Yeni test:** `security-headers.test.ts` — `/sw.js` grubunun `no-cache`
  içerdiğini ve pozitif `max-age` taşımadığını doğrular. (Mutation: kuralı kaldır →
  kırmızı.)
- **#364 kapatılabilir.** Kalan `todo`'lar: #298, #206, #102.
- **Bakılmayan:** yok — 14 test dosyası + 2 doküman.

## Durum (2026-11-06, 25. tur) — başlık değerleri eksik pinlenmişti

`security-headers.test.ts`'in başlık değerlerini ne kadar sıkı denetlediğini
sınadım.

- **Bulgu: `Permissions-Policy` ve HSTS yalnız kısmen pinlenmişti.** Test
  `permissions-policy` için yalnız `camera=()` arıyordu, `strict-transport-security`
  için yalnız `max-age=\d{6,}`. Kanıtlandı: altı direktiften beşini (`microphone`,
  `geolocation`, `payment`, `usb`, `interest-cohort`) düşürmek **veya** HSTS'ten
  `includeSubDomains; preload`'u kaldırmak testi **yeşil bırakıyordu** — yani bir
  düzenleme sessizce API'leri yeniden açabilir / alt alan adlarını downgrade'e
  açabilirdi.
- **Düzeltme:** `permissions-policy` artık altı direktifin **tamamını** sırayla
  eşler; `strict-transport-security` `max-age` **+** `includeSubDomains` **+**
  `preload` şart koşar.
- **Kanıt (mutation):** beş direktifi düşür → kırmızı; HSTS'i zayıflat → kırmızı.
- **Bakılmayan:** yok — 14 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 26. tur) — CSP direktif bütünlüğü

`security-headers.test.ts`'in CSP'yi ne kadar kapsadığını sınadım: test yalnız
`script-src`'i ve beş "yüksek-değer" direktifi denetliyordu.

- **Bulgu: CSP'nin çoğu direktifi pinlenmemişti.** `frame-src` veya `connect-src`
  `*`'a genişletilse (ya da `font-src` gibi bir direktif tümden düşürülse) test
  **yeşil** kalıyordu (kanıtlandı) — yani CSP sessizce gevşetilebilirdi.
- **Düzeltme:** yeni test on beş direktifin **hepsinin** mevcut olduğunu, hiçbirinde
  çıplak `*` bulunmadığını ve çıplak `https:` şemasının yalnız uzak işveren
  görselleri yükleyen `img-src`/`media-src`'de geçtiğini doğrular.
- **Kanıt (mutation):** `frame-src *` → kırmızı; `connect-src *` → kırmızı;
  `font-src` direktifini düşür → kırmızı.
- **Bakılmayan:** yok — 14 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 27. tur) — push kayıt rotasının oturum kapısı

`/api/push/subscriptions` rotasının **oturum kapısını** denetledim.

- **Bulgu: oturum kapısı pinlenmemişti.** Rota gövdeyi ayrıştırmadan önce
  `getUser()` ile oturum istiyor ve yoksa 401 dönüyor — doğru davranış — ama bunu
  doğrulayan **hiçbir test yoktu**. Kapı sessizce kaldırılsa (RPC satırı yine
  `auth.uid()`'e bağladığı için) anonim bir çağıran push kimlik bilgisi
  kaydedebilirdi ve hiçbir test kırmızı olmazdı.
- **Düzeltme:** `push-endpoint-ssrf.test.ts` (aynı rota) artık rotanın
  `getUser()` çağrısının `request.json()`'dan ve 401 dönüşünden **önce** geldiğini
  doğrular.
- **Kanıt (mutation):** oturum kapısını kaldır → kırmızı.
- **Bakılmayan:** yok — 14 test dosyası + 2 doküman. Açık `todo`'lar: #298, #206,
  #102.

## Durum (2026-11-06, 28. tur) — P-01: prerender HTML paylaşımlı önbellekte (#390)

LANE-CLOUDFLARE tur 19'un canlı ölçümüyle açtığı **#390** devralındı; düzeltme
yeri `next.config.ts` (bu lane'e devredilmiş).

- **Bulgu (doğrulandı, düzeltildi):** prerender rotalar (`/blog`, `/contact`,
  `/freelance`, `/about`, `/privacy`, `/terms` + yerel-önekli eşleri) Next'in ISR
  varsayılanıyla `Cache-Control: s-maxage=<n>, stale-while-revalidate=<n>` —
  *paylaşımlı* önbellek direktifi — dönerken aynı yanıtta yerel middleware
  `Set-Cookie: NEXT_LOCALE=…` ekliyor. `Vary` `Cookie`'yi listelemiyor. Klasik
  web-cache-deception deseni; bugün CF HTML'i cache'lemediği için sömürülemez,
  ama bir Cache Rule değişirse dil içeriği sızar.
- **Neden `Vary: Cookie` ile çözülemez (kanıt):** `next.config.ts`'e geçici bir
  `Vary: Cookie` kuralı eklendi, üretim build'i alındı, standalone sunucuda
  `/de/blog` istendi → `Vary: rsc, next-router-state-tree, next-router-prefetch,
  next-router-segment-prefetch, Accept-Encoding`. Next kendi `Vary`'ını yazıp
  config değerini **düşürüyor** (`base-server.js` `setVaryHeader`, yanıt
  gönderilirken uygulanıyor; config başlıkları `router-server.js`'te daha erken
  `setHeader` ediliyor ve sonra üzerine yazılıyor). Bu yüzden tek çare paylaşımlı
  katmanda HTML'i hiç önbelleklememek.
- **Düzeltme:** `next.config.ts` `headers()`'ın başına, matcher'ı **middleware'in
  kendi matcher'ıyla birebir aynı** (`src/proxy.ts:125` →
  `/((?!api|trpc|_next|_vercel|.*\\..*).*)`) bir kural eklendi:
  `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
  Uzantılı yollar, `_next/**`, `/api/**`, `/trpc`, `/vercel` dışarıda → varlık
  `immutable` önbelleği ve `/sw.js` no-cache kuralı korunur.
- **Kanıt (standalone sunucu, `NEXT_DIST_DIR` throwaway build):** `/de/blog` hâlâ
  `x-nextjs-prerender: 1` (iç ISR önbelleği HIT) ama artık `private, no-cache,
  no-store` döner. `/robots.txt` (`public, max-age=0`), `/sitemap.xml`,
  `/llms.txt` (`public, max-age=3600`), `/feed.xml`, `/images/*` **değişmedi**.
- **Kapıya terfi:** `tests/security/security-headers.test.ts` +4 test. Kural
  **Next'in kendi `buildCustomRoute` derleyicisiyle** derlenir (gerçek sunucunun
  eşleştirdiği regex), pozitif liste (12 HTML yolu) + negatif liste (14 varlık
  yolu) sınanır; matcher `src/proxy.ts`'e ratchet'lenir (kaynak escape bağlamı
  farklı olduğu için **derlenmiş regex** üzerinden karşılaştırılır). Bir
  self-test naif `/(.*)`'ın varlıkları da yakaladığını gösterip negatif
  iddiaları anlamlı kılar.
- **Kanıt (mutation):** kuralın `source`'unu naif `/(.*)`'a çevir → negatif test
  kırmızı; `Cache-Control`'e `public` ekle → direktif testi kırmızı.
- **Bakılmayan:** yok — 15 dosya (`tests/security/**` 14 + `next.config.ts`) +
  3 doküman. Açık `todo`'lar değişmedi: #298 (SQL), #206 (`unsubscribe-token-core`
  `server-only`), #139 (anon RPC IP boyutu).

## Durum (2026-11-06, 29. tur) — CI izinleri + service-role grant dedektörleri

Kendi katmanımın iki dedektörünü düşman gözüyle taradım; ikisi de gerçek
yanlış-negatif veriyordu, kanıtladım ve düzelttim.

- **Bulgu + düzeltme: `ci-workflow-permissions.test.ts` yalnız blok biçimli
  `permissions:` görüyordu.** `permissionsBlocks` regex'i `permissions:`'tan
  sonra satır sonu ve girintili satır bekliyordu; job düzeyinde
  `permissions: { contents: write }` (flow-map) ve `permissions: write-all`
  (bare scalar) **hiç görünmüyordu** (kanıt: ikisi de `[]`). Bir job'a bu
  biçimlerle yazma jetonu verip testi yeşil bırakmak mümkündü. `permissionsSpecs`
  artık üç biçimi de, her girintide okuyor; self-test üçünü de doğruluyor.
- **Bulgu + düzeltme: `sql-hardening.test.ts` `serviceRoleOnlySignatures` yalnız
  `grant execute` görüyordu.** `grantedToClients` `grant (execute|all)`'a
  genişletilmişken bu kardeş fonksiyon `grant all on function … to service_role`
  biçimini kaçırıyordu → öyle verilmiş worker RPC guard denetiminden muaf kalıyordu.
  İki tarayıcı hizalandı; `public` de client-grant sayılıyor. Self-test eklendi.
- **Kanıt (mutation):** (a) `ci.yml` `static` job'una flow-map yazma → kırmızı,
  geri alınca yeşil; (b) scratch `grant all … to service_role` + guardsız definer
  → service-role testi kırmızı (eski tarayıcıda yeşil kalırdı).
- **Dış sınır değişmedi:** mevcut header/CSP/grant kontrolleri zaten doğruydu;
  kapatılan şey onları koruyan guard'ın körlüğü. `threat-model.md`'ye işlendi.
- **Bakılmayan:** yok — 15 dosya (`tests/security/**` 14 + `next.config.ts`) +
  3 doküman. Açık `todo`'lar değişmedi: #298, #206, #102.

## Durum (2026-11-06, 30. tur) — sabit liste yerine konu keşfi

Brief'in "dedektörlerin kendisi" hattında yeni bir yanlış-negatif **sınıfı**
bulundu: bir guard denetleyeceği konuyu (rota, çağrı noktası, fonksiyon) **sabit
listeden** alıyorsa, listeye girmeyen yeni bir dosya sınırın dışında kalır ve
guard yeşil kalır. Altı dedektör böyleydi; altısı da kendi konusunu tarayacak
şekilde düzeltildi, her birine self-test eklendi.

- **`cron-route-auth.test.ts`** iki rotayı literal diziden okuyordu → `src/app/api/**`
  ağacından bearer-imzasıyla (`authorization` + `Bearer ${…}` + `*_SECRET|*_TOKEN`)
  keşfediyor. `isBearerSecretGuard` `NEXT_PUBLIC_TOKEN` near-miss'ini reddediyor.
- **`session-cookie-flags.test.ts`** iki çağrı noktasını literal diziden okuyordu →
  `src/**` içinden `createServerClient(?:<…>)?(` çağrı yerlerini keşfediyor.
- **`notification-worker-auth.test.ts`** tek worker'ı yolla sabitliyordu →
  `supabase/config.toml`'dan `verify_jwt = false` fonksiyonlarını keşfediyor.
- **`anonymous-rpc-throttle.test.ts`** throttle kapısını iki RPC adıyla
  döndürüyordu → `anon`'a grant'li fonksiyonları grant taramasından keşfediyor,
  gövdesi `insert/update/delete` içerenleri (yazar) seçiyor.
- **`auth-captcha-wiring.test.ts`** tek dosyayı + yalnız ilk çağrıyı okuyordu →
  `src/features/identity/**`'tan keşfediyor, `authCallBlocks` **tüm** çağrıları
  döndürüyor (ikinci bir `signUp` token'ı düşürse görülür).
- **`anonymous-write-surface.test.ts`** guard dosyalarını iki adla listeliyordu →
  `submit_feedback`/`submit_sales_lead`'i çağıran action'ları `src/features/**`
  içinde RPC çağrısıyla keşfediyor.

**Kanıt (mutation, her biri eski halde yeşil kalırdı):** (a) config-okuması
auth'tan önce olan `src/app/api/probe-cron/route.ts`; (b) flagsiz
`src/server/db/probe-client.ts`; (c) `verify_jwt = false` + sırası bozuk
`supabase/functions/probe-webhook/`; (d) throttle'sız `submit_probe_lead`
migration'ı; (e) token'sız `src/features/identity/probe-second-form.ts`;
(f) guard'sız `src/features/feedback/probe-third-form.ts`. Altısı da artık
kırmızı; probe dosyaları temizlendi.

**Dış sınır değişmedi:** mevcut rota/çerez/worker/throttle kontrolleri zaten
doğruydu; kapatılan şey onları koruyan dedektörün körlüğü. `threat-model.md` ve
`tests/security/README.md`'ye işlendi.

- **Bakılmayan:** yok — `tests/security/**` 15 dosya + `next.config.ts` +
  `docs/threat-model.md` + `tests/security/README.md`. Açık `todo`'lar değişmedi:
  #298, #206, #102.

## Tur — #418 §6: `NEXT_LOCALE` `Secure` bulgusu (PR #422, 2026-11-06)

**Lane:** GÜVENLİK · **Branch:** `lane/guvenlik` · **PR:** #422

**Kapsam.** Öncelik issue #418 (hesap kayıt + tüm hesap işlemleri + çerezler,
uçtan uca denetim) alındı; §6 çerez denetimi uygulandı. `agent:test` etiketli
açık issue yoktu (o etiket LANE-QA/VERIFY'ın).

**Bulgu (tek gerçek eksik).** Üretim `NEXT_LOCALE` çerezi `Secure` taşımıyor.
Gerçek `next-intl` middleware'i + dev sunucu + **üretim standalone** üçünde de
birebir aynı:

```
NEXT_LOCALE=de; Path=/; SameSite=lax      ← Secure YOK
```

`HttpOnly` **eklenemez**: dil değiştirici çerezi istemciden yazıyor
(`site-header.tsx` `<Link … locale={code}>` → next-intl `BaseLink` →
`syncLocaleCookie` → `document.cookie`), `document.cookie` `HttpOnly` atayamaz.

**Devir (düzeltilmedi — görev ayrılığı).** Sahibi LANE-İÇERİK
(`src/i18n/routing.ts`). Düzeltme: `defineRouting({ … })` içine
`localeCookie: { secure: process.env.NODE_ENV === "production" }`. #418'e
`agent:handoff` yorumu bırakıldı.

**Test.** `tests/security/locale-cookie-flags.test.ts` (yeni): pozitif kontrol +
üretim drive self-testi + `todo` kapı. Mutation ile doğrulandı: düzeltme enjekte
edilince 4/4 geçti, geri alınınca `todo`'ya döndü.

**Kanıt (kapılar).** `lint`, `typecheck`, `check:frontend-source` temiz;
`test:security` 108 pass / 0 fail / 4 todo; `test:unit` 727 pass / 0 fail /
2 todo.

**Bakılmayan.** `tests/security/**` 18 dosyanın 15'i bu turda **bakılmadı**
(önceki turlarda denetlendi, CI yeşil). Bu turda tam taranan: yeni test +
`tests/security/README.md` + `docs/threat-model.md`. Açık `todo`'lar değişmedi:
#298, #206, #102, #418 §6.

## Durum (2026-11-06, 32. tur) — #424: API yanıt yüzeyi (platform mı, biz mi?)

LANE-CLOUDFLARE tur 25'in **devri** (#424) alındı: `agent:handoff`, engel değil.
Issue dört bulgu taşıyordu (M-01..M-04) ve "kapsam notu"nda M-01'in gerçek
sahibinin "büyük olasılıkla Vercel platformu" olabileceğini yazıyordu. Bu turun
işi o şüpheyi **ölçüme** çevirmekti.

### Yöntem — ayırt edici ölçüm

Aynı istekleri iki ortamda karşılaştırdım: (a) **canlı** `https://isbulkktc.com`,
(b) **yerel üretim standalone** sunucusu (`NEXT_DIST_DIR=.next-guvenlik-probe
bun run build` → `node .next-guvenlik-probe/standalone/server.js`; platform
katmanı yok). Bir başlık yalnız (a)'da varsa **platform**; her ikisinde de varsa
**repo/framework**.

| # | Canlı | Yerel standalone | Sonuç |
|---|---|---|---|
| M-01 ACAO | `access-control-allow-origin: *` | **yok** | platform (Vercel statik katmanı) |
| M-02 yazma yöntemi | `PUT /` → 200 | `PUT /de/blog` → 200 (HTML) | framework (Next.js) |
| M-03 hata-yolu CC | `public, max-age=0, must-revalidate` | **CC yok** | platform (Vercel dinamik fn) |
| M-04 statik 404 CC | `max-age=31536000, must-revalidate` | `private, no-cache, no-store` | platform (Vercel statik katmanı) |

**Ek kanıt (M-01):** `grep -r access-control-allow-origin src/ next.config.ts` →
**0**. Aynı ACAO `/robots.txt`, `/sitemap.xml`, `/_next/static/*.css`'te de var;
HTML sayfalarında ve `force-dynamic` rotalarda **yok** — yani Vercel yanıtı statik
sınıflandırdığında ekliyor, kaynağı `dynamic = "force-static"`.

**M-02'de devrin atladığı tuzak.** "Sayfa rotalarında non-GET'i reddet" bariz
düzeltmesi **Server Actions**'ı kırar: action'lar bir sayfa yoluna `Next-Action`
başlığıyla **POST** eder. Ölçtüm: `POST /de/blog` + `Next-Action` → 400 (action
taşıyıcısı), başlıksız → 200. Ayrıca cache zehirlenmesi zaten #390 kuralıyla
kapalı (`PUT /de/blog` → `private, no-cache, no-store`). Bu yüzden "405 dön"
önerisi olduğu gibi uygulanamaz.

### Kapı (kendi dosyam)

`tests/security/api-response-surface.test.ts` (yeni, **7 test**, `todo` yok):
1. build-info yalnız `{commit, environment}` döner (fazladan anahtar = yeni
   sızıntı; gövde birebir sabitlenir);
2. build-info kendi `Cache-Control: no-store`'unu taşır;
3. depoda/`next.config.ts`'te/`vercel.json`'da **hiç** ACAO yok (M-01
   platform-only kaldığı sürece geçerli);
4. her `src/app/api/**/route.ts` `dynamic` bildirir (keşif, sabit liste değil);
5. her `force-static` rota `no-store` ile eşlenir;
6-8. üç **self-test** (gövde-şekli guard'ı, ACAO matcher'ı, keşif) guard'ın
   görmediği biçimi gösterir.

### Kanıt (mutation)

| Mutasyon | Sonuç |
|---|---|
| build-info gövdesine `debug: "leaked-secret-value"` ekle | kırmızı (gövde şekli) |
| build-info `no-store` → `public, max-age=60` | **2 kırmızı** |
| `src/app/api/qr/route.ts`'e ACAO ekle | kırmızı (depoda ACAO yok) |
| qr'dan `export const dynamic` sil | kırmızı (dynamic bildir) |

### Devir

- **Yapısal boşluk → LANE-INFRA.** `src/proxy.ts` (oturum/çerez/locale güvenlik
  sınırı) ve `src/app/api/build-info/**` hiçbir lane'in sahiplik tablosunda yok;
  sahiplik tablosunun sahibi LANE-INFRA. Yorum: #424'e bırakıldı.
- M-02 düzeltmesi (yazma yöntemi sözleşmesi) `src/proxy.ts`'e ait; sahibi
  atanınca o lane'e gider.

### Kapılar

`lint` temiz, `typecheck` temiz, `check:frontend-source` geçti, `test:security`
**119 test / 115 pass / 0 fail / 4 todo** (önceki 108 → +11: 7 yeni + 4 self-test
sayımı). `test:unit` değişmedi.

### Bakılmayan

`tests/security/**` 19 dosyanın 16'sı bu turda **bakılmadı** (önceki turlarda
denetlendi, CI yeşil). Bu turda tam taranan: yeni test +
`tests/security/README.md` + `docs/threat-model.md`. Açık `todo`'lar değişmedi:
#298, #206, #102, #418 §6.

## Durum (2026-11-06) — micro-denetim: canlı destek (#398) anon-yazma yüzeyi

Sahip canlı destek istiyor (#398). LANE-URUN widget'ı (`src/features/support/**`)
yazıyor; o widget **anonim** bir yazma RPC'si (`submit_support_message` benzeri)
ve bir tablo (`support_messages`) getirecek. Bu tur, o değişikliğin güvenlik
kapısını önceden sağlamlaştırdı.

### Bulgu — yapısal yanlış negatif (kendi dosyam)

`tests/security/anonymous-write-surface.test.ts` içindeki "the anonymous write
RPCs are not readable by clients" testi tabloları **elle listeliyordu**:

```ts
for (const table of ["feedback_submissions", "sales_leads"]) { … }
```

Bu, bu dosyanın kendi sınıfındaki klasik yanlış negatiftir: **üçüncü** bir anon
yazma RPC'si (tam da #398'in canlı destek mesajı gibi) bu kontrolün hiç
bakmadığı bir tabloya yazar; o tablo `anon`/`authenticated`'tan revoke
edilmezse — yani doğrudan PostgREST'ten okunabilirse — test **yeşil** kalırdı.
`anonymous-rpc-throttle.test.ts` bu sınıf için keşif tabanlı bir kapıya zaten
geçmişti; bu test geride kalmıştı.

**Kanıt (mutation).** Geçici bir probe migration yazıldı: `anon`'a grant'li
`submit_support_message_probe(text)` fonksiyonu, `public.support_messages_probe`
tablosuna `insert` ediyor ve o tablo **revoke edilmemiş**.

| Durum | `anonymous-write-surface` |
|---|---|
| probe **var** | **kırmızı** — `actual: [feedback_submissions, sales_leads, support_messages_probe]` |
| probe **yok** | yeşil — 4 pass |

Yani kapı, canlı desteğin ekleyeceği tam şekli yakalıyor.

### Düzeltme

`anonymousWriteTables()` eklendi: `anon`'a grant'li fonksiyonları grant
ifadelerinden keşfeder, her birinin **son** (`create or replace`) gövdesini
okur, gövdedeki `insert into public.X` hedeflerini toplar. Test artık keşfedilen
kümenin `["feedback_submissions","sales_leads"]` olmasını **ve** her birinin
`revoke all on table public.X from public, anon, authenticated` taşımasını
birlikte ister. Bir **self-test** keşfin iki bilinen yazarı bulduğunu ve
salt-okunur public RPC'lerin tablosunu (jobs/companies/job_source_imports)
dışarıda bıraktığını kanıtlar.

Over-approximation bilinçli: grant'ı sonradan revoke edilmiş bir fonksiyon da
taranır ve tablosu yine "revoke edilmiş olmalı" diye denetlenir — bir anonim
yazarın dokunduğu tablo için doğru son durum budur.

### Devir

Yok — bulgu ve düzeltme kendi dosyamda (`tests/security/**`). Canlı destek
widget'ı LANE-URUN'un; RPC/tablo LANE-SUPABASE'in. #398'e orkestratör notu
düşüldü.

### Kapılar

`lint` temiz, `typecheck` temiz, `check:frontend-source` geçti.
`test:security` **120 test / 116 pass / 0 fail / 4 todo** (önceki 119/115 →
+1 yeni self-test). `test:unit` **739 test / 737 pass / 2 todo** (değişmedi).

### Bakılmayan

Bu turda tam taranan: `anonymous-write-surface.test.ts` (düzeltildi),
`anonymous-rpc-throttle.test.ts`, `cron-route-auth.test.ts`,
`session-cookie-flags.test.ts`, `locale-cookie-flags.test.ts`,
`security-headers.test.ts`, `client-boundary.test.ts`,
`api-response-surface.test.ts` (önceki tur) ve `docs/threat-model.md`.
`tests/security/**` 18 dosyanın kalanı (auth-redirect, push-endpoint-ssrf,
open-redirect, sql-hardening, ci-workflow-permissions, notification-worker-auth,
auth-captcha-wiring, unsubscribe-route-auth) bu turda **bakılmadı** — önceki
turlarda denetlendi, CI yeşil. Açık `todo`'lar değişmedi: #298, #206, #102,
#418 §6 ve LANE-SUPABASE'in `list_engagement_recipients`/`opt_out_engagement`
auth.role() guard'ı (sql-hardening).

## Tur — deploy kotası: Vercel build-rate limiti bir daha dolmasın (#319)

**Lane:** GÜVENLİK (orkestratör) · **Branch:** `lane/guvenlik`

### Ölçülen durum — iki katmanlı kök neden

Sahip "siteye giriyorum, canlı destek yok" dedi. Canlı sitede ölçüm:

| Ölçüm | Değer |
|---|---|
| `https://isbulkktc.com/api/build-info` | `commit 3336de5`, `production` |
| `origin/main` ucu | `6e93629` |
| `3336de5` main'in atası mı? | **evet** (canlı geride, ayrışmış değil) |
| son 3 main merge'inin Vercel durumu | `failure — Deployment rate limited — retry in 24 hours` |
| Vercel hedef URL'i | `vercel.com/orijin1?upgradeToPro=build-rate-limit` |

Yani **her merge 24 saat boyunca canlıya çıkmıyor**; Hobby planı *build sayısını*
sayıyor ve on iki aktif lane'in her push'u kendi preview build'ini yaratıp kotayı
tüketiyor. `prune-vercel-deployments` depolamayı temizler ama **build** sayacını
sıfırlamaz — bu yüzden kotayı açan şey değil.

### Bulgu — iptal edilen build de kotaya sayılıyor

Vercel dokümanı (Ignored Build Step): *"Canceled builds are counted as full
deployments as they execute a build command in the build step… any canceled
builds initiated using the ignore build step will still count towards your
deployment quotas."* Yani `ignoreCommand` **yanlış kaldıraçtır** — build'i iptal
eder ama kotadan düşmez. Kotayı korumanın tek yolu deployment'ı **hiç
yaratmamaktır**.

### Düzeltme

Kök `vercel.json` → `git.deploymentEnabled` (minimatch, Vercel'in resmî anahtarı):

```json
{ "git": { "deploymentEnabled": { "**": false, "main": true } } }
```

Kural: bir branch, eşleşen en az bir kural `true` ise deploy eder; eşleşmeyen
branch varsayılan `true`. `**` tüm branch'leri kapatır, `main` tek istisnadır →
**yalnız `main` build yaratır**, her `lane/*`/`fix/*`/dependabot/renovate push'u
deployment bile oluşturmaz.

**Merge'i engellemez:** Vercel zorunlu check değil; branch protection yalnız
"Quality, database and E2E" istiyor (ölçüldü). Preview build'i kaybetmek hiçbir
CI adımını kırmaz — repo hiçbir yerde preview URL'ine bağlı değil
(`isbulkktc-amber.vercel.app` bir **production** alias, build-info ile doğrulandı).

### Kapı (kendi dosyam)

`tests/security/vercel-deploy-gate.test.ts` (yeni, 5 test, `todo` yok): `main`
deploy eder; 8 örnek lane/fix/bot branch'i **etmez**; eşleşmeyen branch varsayılan
`true`; glob semantiği segment-farkında (minimatch); gönderilen config **tam
olarak iki kural** (daha genişi kırmızı).

**Kanıt (mutation).** `deploymentEnabled` → `{"**":true,"main":true}` yapınca
**2 kırmızı**; geri alınca **5 yeşil**.

### Devir

- **Yapısal boşluk → LANE-INFRA.** Kök `vercel.json` hiçbir lane'in sahiplik
  tablosunda yok (tıpkı `src/proxy.ts` ve `src/app/api/build-info/**` gibi).
  Sahiplik tablosunun sahibi LANE-INFRA; `vercel.json` satırının eklenmesi için
  not bırakıldı.
- LANE-TESLİMAT: `prune-vercel-deployments.mjs` build sayacını sıfırlamıyor —
  bu turun bulgusu, davranış değişikliği istemiyor, ama doküman notu hak ediyor.

### Kapılar

`lint` temiz, `typecheck` temiz, `check:frontend-source` geçti.
`test:security` **125 test / 121 pass / 0 fail / 4 todo** (önceki 120/116 → +5).
`test:unit` **739 test / 737 pass / 2 todo** (değişmedi).

### Bakılmayan

Bu turda tam taranan: `vercel.json` (yeni), `tests/security/vercel-deploy-gate.test.ts`
(yeni), `.github/workflows/prune-vercel-deployments.yml`, `docs/lanes/09-guvenlik.md`.
`tests/security/**` kalan 19 dosya bu turda **bakılmadı** — önceki turlarda
denetlendi, CI yeşil. Açık `todo`'lar değişmedi: #298, #206, #102, #418 §6.

## Tur — micro-denetim: bearer-guard dedektörlerinin başlık-yazımı körlüğü

**Lane:** GÜVENLİK · **Branch:** `lane/guvenlik`

AUDIT.md micro-denetimi: `tests/security/**` sahipli 20 dosya tarandı, bu turda
dört dosya satır satır denetlendi (`cron-route-auth`, `notification-worker-auth`,
`authorization-header` (yeni), `push-endpoint-ssrf`) + iki doküman.

### Bulgu — HTTP başlık adı büyük/küçük harf körlüğü (gerçek yanlış-negatif)

`cron-route-auth.test.ts`'in keşif predicate'i `Authorization` başlığını **küçük
harfli** literalle arıyordu:

```ts
/headers\.get\(\s*["']authorization["']\s*\)/
```

HTTP başlık adları büyük/küçük harf duyarsızdır ve `"Authorization"` **kanonik**
yazımdır. `headers.get("Authorization")` yazan bir cron rotası **keşfedilmiyor**,
yani sıralama / fail-closed / yansıma kontrollerinin **hiçbiri** onun için
koşmuyordu — sessiz yeşil. Ölçülen biçimler:

| Biçim | Eski dedektör |
|---|---|
| `headers.get("authorization")` | keşfedildi |
| `headers.get("Authorization")` (kanonik) | **MISSED** |
| `headers.get("AUTHORIZATION")` | **MISSED** |
| `headers["authorization"]` | **MISSED** |
| `"Bearer " + s` | **MISSED** |
| `const { X } = process.env` | **MISSED** |
| `process.env["X"]` | **MISSED** |
| `new Headers(...)` | **MISSED** |

8/8 gerçekçi biçimin 7'si kaçırılıyordu.

### Düzeltme

`authorizationLookup` artık `.get(...)` ve bracket biçimini, **her harf
durumunda** görüyor; `cron-route-auth` ve `notification-worker-auth` aynı
matcher'ı `tests/security/authorization-header.ts`'ten okuyor (iki tarayıcı
`sql-hardening` kardeşlerinde bir kez sürüklendiği için tek kaynak).

### Kanıt (mutation)

`createSupabaseServiceClient()`'ı `headers.get("Authorization")` kontrolünden
**önce** çağıran `src/app/api/probe-cron-case/route.ts` eklendi:

| Dedektör | probe-cron-case | Sonuç |
|---|---|---|
| eski (case-sensitive) | keşfedilmedi | 0 kırmızı — **sessiz yeşil** |
| yeni (case-insensitive) | keşfedildi | 1 kırmızı — "authenticates before it inspects its configuration" |

Probe temizlendi; iki suite **15/15** yeşil.

### Doğrulanan güçlü kontrol (bulgu yok)

`push-endpoint-ssrf` allowlist'i 25 saldırgan girdiyle sınandı (loopback,
RFC1918, metadata, decimal-IP, `[::ffff:127.0.0.1]`, `0x7f.0.0.1`, `127.1`,
`fcm.googleapis.com@evil`, `fcm.googleapis.com\@127.0.0.1`, punycode,
`%66cm...`): **hiçbir atlatma yok**. İki bilinçli genişlik (gerçek Apple
`*.push.apple.com` / Windows bölgesel alt alanları) allowlist tasarımıdır.

### Kapılar

`lint` temiz, `typecheck` temiz, `check:frontend-source` geçti.
`test:security` **125 test / 121 pass / 0 fail / 4 todo** (yeni self-test'ler
mevcut testleri genişletti, sayı korundu). `test:unit` **739 test / 737 pass /
2 todo** (değişmedi).

### Bakılmayan

Bu turda tam taranan: `cron-route-auth.test.ts`, `notification-worker-auth.test.ts`,
`authorization-header.ts` (yeni), `push-endpoint-ssrf.test.ts`,
`docs/threat-model.md`, `tests/security/README.md`, `docs/lanes/09-guvenlik.md`.
`tests/security/**` kalan 16 dosya bu turda **bakılmadı** — önceki turlarda
denetlendi, CI yeşil. Açık `todo`'lar değişmedi: #298, #206, #102, #418 §6.

## Tur — micro-denetim: #418 §7 log güvenliği kapısı (kapısız madde kapatıldı)

**Lane:** GÜVENLİK · **Branch:** `lane/guvenlik`

#418 §7'nin yedi maddesinden altısı kapılıydı (çerez bayrakları ×2, auth
sıralaması ×2, yanıt yüzeyi, CSRF/oturum bayrakları). **Yedincisi — "Log:
şifre/token loglanmıyor" — kapısızdı.** `console.error("giriş başarısız", { password })`
her kapı yeşilken gönderilebilirdi.

### Bulgu (kanıtlı)

| Boyut | Gözlenen | Beklenen | Etki |
|---|---|---|---|
| Log sızıntısı | `console.*` çağrılarını denetleyen **hiçbir** test yok (`grep -rl console tests/security` → yalnız ilgisiz 2 dosya) | her çağrı etiket loglar, kimlik ifadesi içermez | şifre/token bir log toplayıcısına düşer — hesap devri |

Kod tabanı **bugün temiz** (ölçüldü): 91 `console.*` çağrısı, 0 kimlik ifadesi,
1 izinli istisna (`EMAIL_HEALTH_EVENT` sabiti ilk argüman). Yani kapı bir
**ratchet**: temizliği korur, gerilemeyi kırmızıya çevirir.

### Düzeltme — `tests/security/log-safety.test.ts` (yeni, 5 test)

- **Kural 1:** ilk argüman string/şablon literali veya paylaşılan olay adı
  (`SCREAMING_SNAKE`); çıplak nesne/`Error` yasak.
- **Kural 2:** argümanlarda kimlik ifadesi yasak — (a) değer biçimleri
  (`process.env.*_SECRET|TOKEN|KEY`, `formData.get("password")`, `.access_token`,
  `api_key`, `service_role`), (b) dize literalleri ayıklandıktan sonra çıplak
  kimlik kelimesi. Ayıklama, `"Supabase password update failed."` gibi
  **etiketleri** bulgu saymamak için şart.

### Kanıt (mutation)

| Enjekte edilen | Kural 1 | Kural 2 |
|---|---|---|
| `console.error("sign-in failed", { email, password })` | — | **kırmızı** (`password (bare value)`) |
| `console.error(error)` | **kırmızı** (çıplak `Error`) | — |

Probe temizlendi; 5/5 yeşil. **İlk sürüm kural 2 çıplak `password` değişkenini
kaçırdı**; bu yanlış-negatif mutation sırasında ölçülüp dize-ayıklamalı kelime
taraması eklendi (dedektörün kendi körlüğü de kanıtla kapatıldı).

### Kapılar

`lint` / `typecheck` / `check:frontend-source` temiz.
`test:security` **130 test / 126 pass / 0 fail / 4 todo** (125→130).
`test:unit` **739 / 737 pass / 2 todo** (değişmedi).

### Bakılmayan

Bu turda tam taranan: `log-safety.test.ts` (yeni), `session-cookie-flags.test.ts`,
`locale-cookie-flags.test.ts`, `oauth-signup-intent.ts`,
`src/features/identity/actions.ts`, `src/server/email/mailer.ts`,
`docs/threat-model.md`, `tests/security/README.md`. `tests/security/**` kalan
dosyalar bu turda **bakılmadı**. Açık `todo`'lar değişmedi: #298, #206, #102,
#418 §6, #424 (M-01/M-03/M-04 → #434 ile kapılı; M-02 → #435 LANE-INFRA).

---

## Tur 35 — log güvenliği kapsamı `scripts/**` (#418 §7)

### Bulgu

| # | Dosya:satır | Gözlenen | Beklenen | Etki |
|---|---|---|---|---|
| G-1 | `tests/security/log-safety.test.ts:30` (eski `ROOTS`) | Tarama yalnız `src` + `supabase/functions` | CI'da en ayrıcalıklı token'larla (`GH_TOKEN`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) koşan `scripts/**` da kimlik sızıntısı için taranmalı | Bir deploy script'inde token loglanırsa kapı **sessizce yeşil** kalır |

**Neden kapsam dışıydı:** 34. tur kapısı `console.*` çağrılarını yalnız uygulama
kaynağında arıyordu. Ama `scripts/prune-vercel-deployments.mjs`,
`scripts/approve-pending-runs.mjs`, `scripts/system-health.mjs` CI'da gerçek
token'larla koşar; sızıntı oradadır.

### Düzeltme (ölçülü kapsam kararı)

- **Kural 2** (kimlik ifadesi) `scripts/**`'e genişletildi. Ölçüm: kod tabanında
  `scripts`'te hiçbir `console.*` argümanı kimlik ifadesi içermiyor → **0
  yanlış-pozitif**.
- **Kural 1** (ilk argüman etiketi) genişletil**medi**: `scripts` CLI'ları bilinçli
  olarak `error.message` / `JSON.stringify(findings)` yazar (11 adet). Bunlar
  teşhis, kimlik değil. Kapsamlar bu yüzden ayrı tutuldu
  (`literalFirstArgumentFiles`).

### Kanıt (mutation, iki yönlü)

| Senaryo | Eski `ROOTS` | Yeni `ROOTS` |
|---|---|---|
| `scripts/probe-token-leak.mjs`: `console.error(\`… ${process.env.GH_TOKEN}\`)` | **0 kırmızı** (kör) | **kural 2 kırmızı** (`process.env.GH_TOKEN`) |

Probe silindi. Bir self-test ROOTS'un `scripts`'i içerdiğini, kural 1'in
içermediğini ve kural 1'in hâlâ `src`/`supabase/functions`'ı kapsadığını ratchet'ler.

### Kapılar

`lint` / `typecheck` / `check:frontend-source` temiz.
`test:security` **131 test / 127 pass / 0 fail / 4 todo** (130→131).
`test:unit` **739 / 737 pass / 2 todo** (değişmedi).

### Bakılmayan

Bu turda taranan: `log-safety.test.ts`, `session-cookie-flags.test.ts`,
`auth-captcha-wiring.test.ts`, `anonymous-write-surface.test.ts`, `scripts/*.mjs`
(kimlik kapsamı), `src/features/identity/actions.ts` (hata eşleme), çerez politikası
sayfası + `Legal.cookies` mesajları. `tests/security/**` kalan dosyalar bu turda
**bakılmadı**.

### Devir (kendi alanım dışı)

- **`System health` kendini besleyen kırmızı döngü.** Kanıt: 18:58Z koşusu (id
  `42275551449`, #425 sonrası ilk) → `FAIL main CI: 1 workflow(s) red: Verify
  production deployment`. 19:56Z koşusu (id `42283969887`) → `2 workflow(s) red:
  System health, Verify production deployment`. Yani kontrol, kendi önceki kırmızı
  koşusunu "main'de kırmızı workflow" sayıp kendini besliyor. `scripts/system-health.mjs`
  **LANE-OPERATÖR** sahipliğinde; #427 yalnız verify yarışını kapsıyor, self-latch
  yarısı açık → **#451** (`lane:operator` + `agent:handoff`).
