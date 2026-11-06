# LANE-AUTH — kimlik, oturum, e-posta şablonları, güvenlik

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- Supabase Auth. **`auth.email.enable_confirmations = true`** → doğrulanmamış mailbox oturum açamaz; `email_not_confirmed` hatası `emailNotConfirmed` mesajına eşlenir (generic `signInFailed`'a katlama).
- **E-posta şablonları `supabase/templates/`'te**; `config.toml` `[auth.email.template.<name>]` + `content_path` ile işaret eder (yol `./supabase/templates/...` biçiminde). Şablon adı serbest TOML anahtarı → typo sessizce yok sayılır; GoTrue listesiyle (`confirmation`, `recovery`, `invite`, `magic_link`, `email_change`, `reauthentication`) çapraz kontrol et.
- Yerel mail catcher port `54324`; E2E oturum açmadan önce onay linkini tüketmeli.
- RESEND entegrasyonu var; `SENDER_EMAIL_ADDRESS` secret.

## Sahip olduğun yollar
`src/features/identity/**`, `src/app/[locale]/(auth)/**`, `supabase/templates/**` (şablon **içeriği**).
**`supabase/config.toml` ve `supabase/migrations/**` = LANE-SUPABASE'e ait — dokunma, ihtiyacı raporla.**

## Yapılacaklar
1. **Oturum akışı:** sign-up → confirmation → sign-in → recovery → invite; her adımda hata mesajları doğru mu, kullanıcıyı doğru yere yönlendiriyor mu?
2. **E-posta şablonları:** 6 dil? Marka tutarlı mı? Erişilebilir HTML (tablo tabanlı, inline CSS, alt metin)? Linkler mutlak ve doğru mu?
3. **Güvenlik:** şifre politikası, oturum süresi, rate limit (CF lane ile koordine), açık yönlendirme (open redirect) yok, CSRF, `service_role` asla client'a sızmıyor.
4. **RLS etkisi:** auth kullanıcısı hangi veriye erişebiliyor; yetki yükseltme açığı var mı (LANE-SUPABASE ile rapor et).
5. **Hata/erişilebilirlik:** form etiketleri, `aria-live` hata duyuruları, klavye ile tamamlanabilirlik.

## Kurallar
- Auth akışı testi **gerçek** olmalı (mock yok); mümkünse yerel mail catcher ile uçtan uca.
- Şablon değişikliğinde GoTrue'nun beklediği değişkenleri (`{{ .ConfirmationURL }}` vb.) koru.
- Gizli anahtar/şifre commit'lenmez.

## Raporla
Akış diyagramı + bulunan açıklar + düzeltmeler + testler. Branch + PR, CI yeşil.

---

## Çalıştırma raporu — 2026-11-04

```
Lane: LANE-AUTH            Branch: lane/auth            PR: #98
Değişen dosyalar:
  src/features/identity/auth-routing.ts        (+ callbackAudienceParam)
  src/features/identity/schemas.ts             (resendConfirmationSchema.audience)
  src/features/identity/actions.ts             (resend + sign-up + OAuth start)
  src/features/identity/sign-in-form.tsx       (gizli audience alanı)
  src/features/identity/auth-audience-routing.test.ts  (yeni, 4 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (358, 4'ü yeni)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; şablon/config değişmedi)
```

### Bulunan açık (düzeltildi)
`email_not_confirmed` kurtarma formu yalnız e-posta+locale gönderiyordu ve
`resendConfirmation` onay bağlantısını sabit `next=candidate` ile kuruyordu.
Doğrulanmamış bir **işveren** "yeniden gönder" deyip e-postadaki bağlantıya
tıklayınca `/profile/dashboard` (aday) panosuna düşüyordu; kendi panosu
`/company/dashboard` yerine. sign-up ve OAuth-start yolları audience'ı zaten
doğru taşıyordu — yalnız resend eksikti.

Düzeltme: `callbackAudienceParam()` (audience→`next` tek kaynağı), şemaya zorunlu
`audience`, form gizli alanı, aksiyonda `next` türetimi; sign-up/OAuth-start
ternary'leri de aynı helper'a çekildi.

### Güvenlik değerlendirmesi (security skill)
- `next` istemci kontrollü ama `/company/dashboard` gerçek `company_members`
  kaydına bağlı (`getEmployerWorkspace` → yoksa `/company/new`). Ayrıcalık
  yükseltme yok; düzeltme yalnız yönlendirme doğruluğu.
- `service_role` anahtarı hiçbir identity dosyasında yok (yalnız
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ve `AUTH_OAUTH_PROVIDERS` okunuyor).
- E-posta şablonları GoTrue sözleşmesiyle çapraz kontrol edildi: `.Data`
  (user_metadata), `.ConfirmationURL`, `.Email`, `.NewEmail`, `.Token`,
  `.SiteURL` — hepsi güncel `supabase/auth` (v2.197) kaynağında mevcut.
- Şablonlarda `<script>`/inline handler/`javascript:`/iframe yok; tüm
  bağlantılar mutlak https; tek stil sayfası ve WCAG kontrast testi mevcut.

### QA (qa-changes skill)
Gerçek modüllerle (tsx) before/after:
```
BASELINE employer resend link : /en/auth/callback?next=candidate -> /en/profile/dashboard
FIXED    employer resend link : /en/auth/callback?next=company   -> /en/company/dashboard
```
Tam yerel Supabase + Mailpit E2E'si bu sandbox'ta Docker olmadığı için
çalıştırılamadı (3 farklı yaklaşım denendi, hepsi Docker'a bağlı); mantık gerçek
modüllerle yürütüldü ve birim testiyle kilitlendi.

### Sahibin yapması gerekenler
- `src/app/[locale]/auth/callback/route.ts` sahiplik tablosunda hiçbir lane'e
  atanmamış. Auth ile ilgili olduğundan LANE-AUTH'a (veya LANE-URUN'a) açıkça
  atanmalı. Bu PR o dosyaya dokunmadı.

### Sonraki lane için notlar
- **Invite akışı:** GoTrue davet linki implicit (`#access_token=...`) redirect
  döndürüyor; callback rotası yalnız PKCE `?code=` işliyor. E2E bunu kısıt
  olarak belgeliyor. Davranış değişikliği gerektirdiğinden bu lane'in kapsamı
  dışında bırakıldı; ayrı bir iş olarak ele alınmalı.
- E-posta şablonları (6 dil, marka, erişilebilirlik) ve `config.toml` kablolaması
  incelendi: şablon adları GoTrue listesiyle eşleşiyor, `content_path`'ler
  mevcut, konular yerelleştirilmiş. Bu turda değişiklik gerekmedi.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Değişen dosyalar:
  src/features/identity/admin-mfa-factors.ts        (yeni, saf seçici)
  src/features/identity/admin-mfa-factors.test.ts   (yeni, 6 test)
  src/features/identity/identity-client-boundary.test.ts (yeni, 2 test)
  src/features/identity/admin-mfa-actions.ts        (bayat faktör temizliği)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (388, 8'i yeni) / test:security ✅ (21: 17 pass, 4 todo — hepsi
  önceden var olan, lane dışı bulgular)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; şablon/config değişmedi)
```

### Denetlenen dosyalar
`git ls-files` ile 23 identity + 4 `(auth)` route + 7 şablon = **34 dosya**,
tamamına bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `admin-mfa-actions.ts:59-78` | mantık/durum makinesi | Yarım kalan TOTP enrollment satırı `listFactors().totp`'ta görünmez (auth-js yalnız `verified` bucket'lar) ama satır kalır; aynı `friendlyName` ile ikinci enroll GoTrue'da `mfa_factor_name_conflict` (422) → `setupFailed` | Bayat doğrulanmamış faktör enroll'dan önce temizlenir | Yönetici kurulum ekranından bir kez çıktıysa 2FA'yı **hiç** tamamlayamaz; 10 denemede `MaxEnrolledFactors` dolup kalıcı kilit | düzeltildi |
| 2 | `auth-errors.ts:13` | hata yolu | GoTrue `same_password` döndüğünde `messageForAuthErrorCode` eşlemediği için genel `passwordUpdateFailed` gösterilir | "Yeni şifre eskisinden farklı olmalı" mesajı | Kullanıcı nedenini anlamaz, aynı şifreyi tekrar dener | devredildi (aşağıda) |
| 3 | `turnstile.ts:8` | ölü kod | `turnstileResponseField` export'u hiçbir yerden okunmuyor (üretici/tüketici aynı dosyada sabit kullanıyor) | — | Önemsiz; silmek churn | bilgi |

### Düzeltilen / devredilen
- **Düzeltildi (#1):** `beginAdminMfa`, `mfa.enroll` çağrısından **önce**
  `staleUnverifiedTotpFactorIds(factorList.all)` ile seçilen bayat
  doğrulanmamış TOTP faktörlerini `mfa.unenroll` ile siler. Doğrulanmamış
  faktörün silinmesi AAL2 gerektirmez; doğrulanmış faktöre dokunulmaz.
- **Devredildi (#2):** `same_password` eşlemesi `src/messages/**` içine yeni bir
  anahtar eklemeyi gerektiriyor; o dizin sahiplik tablosunda hiçbir lane'e
  atanmamış. Tek-yazar kuralını bozmamak için bu lane dosyaya dokunmadı.
  Sahibi belirlenince: `authErrorMessages`'a `same_password: "passwordUnchanged"`
  ekle + 6 katalogda `AuthForms.messages.passwordUnchanged`. (Kanıt: GoTrue
  `internal/api/user.go` → `ErrorCodeSamePassword`.)

### Güvenlik değerlendirmesi (security skill)
- Kimlik istemci sınırı tarandı: hiçbir `"use client"` identity modülü `@/server/**`
  import etmiyor, `NEXT_PUBLIC_` olmayan env okumuyor. Yeni `identity-client-boundary.test.ts`
  bunu ratchet'ler.
- `service_role` hiçbir identity dosyasında yok (yalnız `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  ve `AUTH_OAUTH_PROVIDERS` okunuyor).
- Açık yönlendirme: callback yalnız sabit sözlük (`candidate`/`company`, `email`/`oauth`/`reset`)
  kullanıyor; testlerde `//evil.example`, `../../etc` reddi kilitli.
- `mfa.unenroll` yalnız **oturum sahibinin** kendi faktörünü siler (GoTrue
  `UnenrollFactor` oturum+faktör eşleşmesi ister); yetki yükseltme yolu yok.

### QA (qa-changes skill)
Gerçek modül (`tsx`) ile before/after — GoTrue `validateFactors` + auth-js
`listFactors` bucket'laması modellendi:
```
has verified factor?      : false (false -> enroll path)
BEFORE (no cleanup)       : 422 mfa_factor_name_conflict -> setupFailed
stale ids selected        : [ 'stale' ]
AFTER  (cleanup applied)  : 200 enrollment started
```
Tam yerel Supabase + Mailpit E2E'si bu sandbox'ta Docker olmadığı için
çalıştırılamadı; mantık gerçek modülle yürütüldü ve birim testiyle kilitlendi.

### Şablonlar (bu tur)
6 GoTrue şablonu + `password-changed.html` yeniden okundu: GoTrue `EmailData`
(`.Email`, `.NewEmail`, `.ConfirmationURL`, `.Token`, `.SiteURL`, `.Data`) ile
uyumlu, `<script>`/inline handler/`javascript:`/iframe yok, linkler mutlak https,
tek stil sayfası. Değişiklik gerekmedi.

### Sahibin yapması gerekenler
- `src/app/[locale]/auth/callback/route.ts` hâlâ hiçbir lane'e atanmamış (önceki
  turdan devam). Auth ile ilgili; LANE-AUTH'a atanmalı.
- `src/messages/**` sahipliği belirsiz: AUTH'a verilirse #2 burada kapatılabilir.
- **Değişmez kural 3:** `src/features/identity/**` sahipliği LANE-URUN'dan
  (`src/features/**`) hariç tutulmalı; `docs/lanes/00-orchestration.md` tablosu
  bunu şu an `!src/features/identity/**` ile yapıyor — teyit yeterli.

### Sonraki lane için notlar
- **Invite akışı** (önceki turdan): GoTrue davet linki implicit (`#access_token=`)
  döndürüyor; callback yalnız PKCE `?code=` işliyor. Ayrı iş.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 2)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Değişen dosyalar:
  src/features/identity/use-captcha-action.ts        (stale-state maskeleme)
  src/features/identity/captcha-stale-state.test.ts  (yeni, 3 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (395, 3'ü yeni) / test:security ✅ (17 pass, 4 todo — hepsi
  önceden var olan, lane dışı bulgular)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; şablon/config değişmedi)
```

### Denetlenen dosyalar
`git ls-files 'src/features/identity/**' 'src/app/[locale]/(auth)/**'
'supabase/templates/**'` → **33 dosya** (26 identity + 7 şablon; `(auth)`
route'ları `git ls-files` glob'unda görünüyor ama bu turda değişiklik gerekmedi).
Tamamına bakıldı; bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `use-captcha-action.ts:27-41` + `sign-in-form.tsx:100-103` / `sign-up-form.tsx:64-67` / `password-reset-form.tsx:31-34` | erişilebilirlik / doğruluk | `captchaBlocked` iken `<CaptchaNotice>` durum mesajının **yerine** render edilir, ama `aria-describedby` yalnız `state.message !== "idle"`'e bakıyor; engellenen submit aksiyona ulaşmadığından `state` **önceki turun** hatasını taşır → alan, artık DOM'da olmayan `login-form-message`'ı işaret eder (dangling idref) | Alan yalnız render edilen mesajı tarif eder | axe `aria-valid-attr-value` ihlali (WCAG 4.1.2); ekran okuyucu var olmayan açıklamayı okur. axe E2E kapısı bunu görmez: yalnız ilk yüklemede denetler, oysa kusur "oturmuş hata → engellenen submit" sırasını gerektirir | düzeltildi |
| 2 | `turnstile.ts:8` | ölü kod | `turnstileResponseField` export'u hiçbir yerden okunmuyor (üretici/tüketici aynı dosyada sabit kullanıyor) | — | Önemsiz; silmek churn | bilgi (önceki turdan) |

### Düzeltilen / devredilen
- **Düzeltildi (#1):** `useCaptchaAction` artık `visibleCaptchaState(state,
  initialState, captchaBlocked)` döndürür — engellenen submit'te idle duruma
  düşer. Tek kaynak hook olduğu için üç form (sign-in, sign-up, password-reset)
  birden düzelir; formlar `state`'i okumaya devam eder.
  Kanıt (gerçek modülle before/after, `.probe-tmp.ts`):
  ```
  BEFORE (raw action state): {"describedby":"login-form-message","messageRendered":false,"dangling":true}
  AFTER  (masked state)    : {"describedby":null,"messageRendered":false,"dangling":false}
  ```
  axe kaynağı doğrulandı: `aria-valid-attr-value`'nun `aria-describedby`
  pre-check'i dangling idref'i reddeder (`node_modules/axe-core/axe.js`).

### Güvenlik değerlendirmesi (security skill)
- `next`/`flow`/`sb_flow_id`/`audience` sözlükleri değişmedi; callback yalnız
  sabit değerleri yola çeviriyor. `//evil.example`, `../../etc` reddi testlerle
  kilitli.
- `service_role` hiçbir identity dosyasında yok; client sınırı
  `identity-client-boundary.test.ts` ile ratchet'li.
- Bu tur yalnız sunum katmanı (ARIA durumu) düzeltti; yetki/oturum yolu
  değişmedi.

### QA (qa-changes skill)
Gerçek modül (`tsx`) ile önce/sonra yukarıda. Tam yerel Supabase + Mailpit
E2E'si bu sandbox'ta Docker olmadığı için çalıştırılamadı; kusur saf durum
fonksiyonuna indiği için birim testiyle kilitlendi.

### Sahibin yapması gerekenler
- `src/app/[locale]/auth/callback/route.ts` hâlâ hiçbir lane'e atanmamış (önceki
  turdan devam). Auth ile ilgili; LANE-AUTH'a atanmalı.
- `src/messages/**` sahipliği belirsiz; AUTH'a verilirse önceki turun
  `same_password → passwordUnchanged` eşlemesi burada kapatılabilir.


---

## Çalıştırma raporu — 2026-11-05 (issue turu: #161, #162)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue'lar: #161 (sosyal giriş gecikme/yanlış hata), #162 (mükerrer kayıt)
Değişen dosyalar:
  src/features/identity/oauth-providers.ts            (+ resolveEnabledOAuthProviders)
  src/features/identity/auth-errors.ts                (+ 4 mükerrer kod eşlemesi)
  src/features/identity/actions.ts                    (startOAuthSignIn toleranslı okuma)
  src/app/[locale]/(auth)/login/page.tsx              (toleranslı okuma)
  src/app/[locale]/(auth)/register/page.tsx           (toleranslı okuma)
  src/features/identity/oauth-providers-resilience.test.ts   (yeni, 4 test)
  src/features/identity/duplicate-account-errors.test.ts     (yeni, 3 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (426, 7'si yeni) / test:security ✅ (22 pass, 2 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files` → 34 dosya (27 identity + 7 şablon); `(auth)` route'ları dahil
tamamına bakıldı. Bakılmayan dosya yok.

### #161 — sosyal giriş gecikmesi / yanlış "başarısız" uyarısı
Kök neden **kanıtla** araştırıldı:

- **Canlı authorize probu (read-only, üretim):** Google ve LinkedIn
  `/auth/v1/authorize` → **302**, doğru sağlayıcı login host'una; `redirect_to`
  aynen taşınıyor. Sağlayıcılar çalışıyor.
- **Canlı callback probu (read-only, üretim):** `?flow=oauth&next=candidate`
  (code'suz) → `307 /en/login?error=oauth&audience=candidate`; geçersiz
  `?code=` → aynı; `?error=access_denied&error_code=...` → `error=verification`.
  Yani **hata yolu doğru** ve yalnız gerçek hatada tetikleniyor; başarılı
  oturumda `resolveAuthDestination`'a gidiyor (kod bunu `getUser()` kontrolüyle
  garanti ediyor, `tests/unit/oauth-callback-success.test.ts` kilitliyor).
- **Yarış koşulu:** callback tek kullanımlık PKCE kodunu ikinci kez aldığında
  `flow_state_not_found` → oturum zaten varsa başarı kabul ediliyor (mevcut).
- **BULUNAN AÇIK (bu turda kapatıldı):** `parseEnabledOAuthProviders` **bozuk
  `AUTH_OAUTH_PROVIDERS`**'ta (bilinmeyen sağlayıcı, çift virgül) **throw**
  ediyordu; `getEnabledOAuthProviders()` bunu **render sırasında** çağırdığı için
  `/login` ve `/register` **6 dilde 500** verirdi — kilitli kullanıcının en çok
  ihtiyaç duyduğu iki sayfa. Bu, "gecikme + başarısızlık" semptomunun
  operatör-kaynaklı bir varyantı. **Düzeltme:** `resolveEnabledOAuthProviders()`
  (throw'u yutar → boş liste, boş env ile aynı durum); login/register sayfaları
  ve `startOAuthSignIn` bu korumalı yolu kullanır. Katı parser `auth:verify`
  (ops) için korunur. Kanıt: `google,facebook` → eskiden 500, şimdi `[]`.
- Kalan #161 alt-başlıkları (sağlayıcı konsolu ayarı, üretim logları) **canlı
  sbp_ token + gerçek hesap** gerektiriyor; bu sandbox'ta yapılamıyor (401).
  Bulgu sahibin doğrulamasına not edildi.

### #162 — mükerrer kayıt
- **BULUNAN AÇIK (bu turda kapatıldı):** GoTrue mükerrer kaydı tek kodla
  bildirmiyor; `email_exists`, `user_already_exists`, `identity_already_exists`,
  `email_conflict_identity_not_deletable` kodları `auth-errors.ts` haritasında
  **yoktu** → genel `signUpFailed` ("bilgilerin yanlış") gösteriliyordu, oysa
  hesap zaten var. **Düzeltme:** dördü de `emailAlreadyRegistered`'a eşlendi
  (`email_not_confirmed` deseniyle aynı). Kanıt: önce `signUpFailed`, sonra
  `emailAlreadyRegistered`.
- **DB tarafı temiz (kanıtlandı):** `profiles.id` PK → `auth.users` ile 1:1;
  `handle_new_auth_user` insert'i `on conflict (id) do nothing` → idempotent.
  Yani mükerrer kayıt olsa bile ikinci `profiles` satırı oluşmuyor.
- **Büyük/küçük harf:** GoTrue + uygulama şeması (`trim().toLowerCase()`)
  normalize ediyor → `Ali@X.com`/`ali@x.com` ayrı hesap açmıyor.
- **Kalan karar Supabase'te:** `supabase/config.toml`'da identity-linking ayarı
  **yok** → varsayılan davranış. Sahibi LANE-SUPABASE olduğu için **#181**
  (`lane:supabase` + `agent:handoff`) açıldı, kanıtla.

### Güvenlik değerlendirmesi (security skill)
- `resolveEnabledOAuthProviders` yalnız **throw'u yutar**; kabul edilen değerler
  yine katı Zod enum'undan geçer, yani allowlist genişlemiyor.
- Mükerrer-kod eşlemesi bir **mesaj** değişikliği; hesap açma/kapama yetkisi
  değişmedi. `emailAlreadyRegistered` kullanıcıya hesabın varlığını söyler —
  GoTrue zaten `signUp` obfuscation'ıyla bunu e-posta sahibine açık ediyor,
  yeni bir enumeration yolu açılmıyor (form akışı, kullanıcı kendi adresini
  biliyor).
- Yeni yollarda `service_role` yok; client sınırı testi yeşil.

### Devredilen
- **#181** → LANE-SUPABASE: `config.toml` identity-linking politikası (kanıt
  gövdede).

### Sahibin yapması gerekenler
- `src/app/[locale]/auth/callback/route.ts` hâlâ hiçbir lane'e atanmamış
  (önceki turdan). Auth ile ilgili; LANE-AUTH'a atanmalı.
- Üretim OAuth davranışı için sbp_ token'ıyla `bun run auth:verify` ve gerçek
  hesap denemesi (bu sandbox'ta 401).
- `src/messages/**` sahipliği belirsiz; AUTH'a verilirse `same_password →
  passwordUnchanged` eşlemesi burada kapatılabilir.

---

## Çalıştırma raporu — 2026-11-05 (issue turu: #171)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: #171 (auth e-postaları Gmail/Outlook'ta düz yazı görünüyor)
Değişen dosyalar:
  supabase/templates/*.html (7 şablon)               (tablo + satır içi stil + logo)
  src/features/identity/email-template-layout.test.ts (yeni, 5 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (442, 5'i yeni) / test:security ✅ (24 pass, 3 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**' 'src/app/[locale]/(auth)/**'
'supabase/templates/**'` → **36 dosya**; bu turda 7 şablon yeniden yazıldı, kalan
29 dosya önceki turlarda denetlendi ve değişmedi. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `supabase/templates/*.html` (7) | görsel/erişilebilirlik | Düzen `div`+`<style>` sınıflarıyla; `<img>` **0**; Gmail `<style>`'ı kaldırır, Outlook yok sayar → düz yazı | Tablo kabuğu + **satır içi** stil + marka logosu | Auth e-postaları markasız düz metin görünüyordu (kullanıcı bildirimi) | düzeltildi |
| 2 | `supabase/templates/*.html` | spam skoru / tutarlılık | Transactional sistem (`email-layout.ts`) zaten doğru yapıda; iki sistem farklı görsel dil | İki sistem aynı kabuğu paylaşmalı | Tutarsız marka + auth mail'leri zayıf | düzeltildi (aynı `LOGO_URL` + palet) |
| 3 | `supabase/templates/password-changed.html` | erişilebilirlik | (kontrol edildi) `h1`+`h2`+`lang`/`dir` var; değişiklik gerekmedi | — | — | bilgi |

### Düzeltilen
- 7 şablon **tablo tabanlı kabuğa** taşındı (`role="presentation"`, 600px ortalanmış,
  `div`/flex/grid yok). Kabuk `email-layout.ts` ile aynı: yeşil `#0D5C3A` başlık,
  `LOGO_URL` logosu (`alt="İşBul KKTC"`), `#F5F2EB` zemin, `#E6E4DE` ayırıcı,
  ortalanmış footer.
- Her metin/buton/not/kod öğesine **satır içi stil**; `<style>` bloğu yalnız
  kademeli iyileştirme (dark mode, hover, mobil padding) olarak kaldı ve 7
  şablonda **birebir aynı**.
- Preheader `opacity:0;color:transparent` + `mso-hide:all` ile her şablonda.
- GoTrue değişkenleri (`.Email`, `.NewEmail`, `.ConfirmationURL`, `.Token`,
  `.SiteURL`) ve 6 dil + `fa` RTL aynen korundu.

### Kanıt
- Logo canlı: `curl -I https://isbulkktc.com/images/isbul-logo-mark-white.png` →
  **200**, `image/png`, 83686 bayt.
- Issue'nun doğrulama komutu: her şablonda `img=1`, `styleblock=1`, `inline=16-17`.
- Gerçek modülle render (6 dil × 7 şablon): `{{` artığı yok, marka metni var.
- `tests/unit/auth-hardening.test.ts` (LANE-QA renderer'ı) **21/21** geçiyor —
  diller, GoTrue değişkenleri, `.ConfirmationURL`, mutlak https linkler, `<script>`
  yokluğu, WCAG kontrast tabanları dahil.
- Yeni `email-template-layout.test.ts` (5 test) tablo/satır içi/logo sözleşmesini
  ve `LOGO_URL` paylaşımını kilitler.

### Güvenlik değerlendirmesi (security skill)
- Şablonlarda `<script>`, inline event handler, `javascript:`, `<iframe>` yok
  (QA testi kilitliyor). Tüm linkler mutlak https.
- Logo URL'i sabit ve marka alan adında; kullanıcı girdisi şablona girmiyor.
- `{{ .ConfirmationURL }}` tek eylem linki kaynağı olarak korundu → `redirect_to`
  kaybolmuyor (token_hash elle kurulmuyor).

### Devredilen
- **#170** (SPF/Resend + auth SMTP) — spam sorunu; `supabase/config.toml`/DNS
  gerektirir, LANE-CLOUDFLARE + LANE-SUPABASE sahipliğinde. Bu turda dokunulmadı.

### Sahibin yapması gerekenler
- **Gmail/Outlook'ta gerçek e-posta ile görsel doğrulama** (kabul ölçütü): bu
  sandbox'ta canlı Supabase'e yazma/gerçek gönderim yok. `supabase/templates/**`
  değişikliği hosted projeye `db push`/dashboard ile alınmalı (LANE-SUPABASE).

---

## Çalıştırma raporu — 2026-11-05 (issue turu: #167)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: #167 (Supabase oturum çerezi @supabase/ssr varsayılanlarında:
              httpOnly:false, Secure yok)
Değişen dosyalar:
  src/proxy.ts                              (+ cookieOptions)
  src/server/db/supabase-server.ts          (+ cookieOptions)
  src/features/identity/email-template-layout.test.ts (+ RTL guard)
  supabase/templates/*.html (7)             (RTL başlık boşluğu düzeltmesi)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (445, 1'i yeni) / test:security ✅ (35 pass, 3 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**' 'src/app/[locale]/(auth)/**'
'supabase/templates/**'` → **37 dosya**. Bu turda 7 şablon + 1 test dosyası
düzenlendi; kalanlar önceki turlarda denetlendi. Ayrıca #167 kapsamında
**sahiplik tablosunda hiçbir lane'e atanmamış** 2 çağrı noktası
(`src/proxy.ts`, `src/server/db/supabase-server.ts`) düzenlendi — issue bunu
açıkça LANE-AUTH'a veriyor (aşağıda gerekçe). Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/proxy.ts:36`, `src/server/db/supabase-server.ts:87` | yetki/güvenlik (kimlik) | `createServerClient` `cookieOptions` geçmiyor → `httpOnly:false`, `Secure` yok (kanıt: `DEFAULT_COOKIE_OPTIONS`) | `httpOnly:true`, `secure` üretimde, `sameSite:lax`, `path:/` | XSS ile enjekte JS oturum çerezini okuyup hesabı devralabilir | düzeltildi |
| 2 | `supabase/templates/*.html:45` (7) | RTL / erişilebilirlik | Logo↔marka arası boşluk `padding-left:14px` (fiziksel özellik) | `dir=rtl`'de `padding-right` olmalı | `fa` e-postasında logo ada değiyor, boşluk yanlış tarafta | düzeltildi |
| 3 | `src/features/identity/oauth-signup-intent.ts` | mantık | (kontrol edildi) `parseOAuthSignupIntent` sınır/saat kayması testleri mevcut; sorun yok | — | — | bilgi |
| 4 | `src/features/identity/account-panel.tsx` | erişilebilirlik | (kontrol edildi) `aria-hidden` avatar + görünür ad; WCAG 2.5.3 sorunu yok | — | — | bilgi |

### Düzeltilen
- **#1:** İki `createServerClient` çağrısına ortak `cookieOptions`
  (`httpOnly:true`, `secure: process.env.NODE_ENV === "production"`, `sameSite:"lax"`,
  `path:"/"`) eklendi. `HttpOnly` güvenli: tarayıcıda oturum çerezini okuyan kod yok
  (`createBrowserClient` yok; tek `document.cookie` yazımı `ib_consent`, ayrı çerez).
  `secure` koşullu çünkü `localhost` güvenli bağlam → E2E/yerel dev kırılmıyor.
  **Sahiplik gerekçesi:** çağrı noktaları tabloda atanmamış; #167 (LANE-GÜVENLİK
  açtı) düzeltmeyi açıkça LANE-AUTH'a veriyor ("oturum akışı … güvenlik"), ve
  `tests/security/session-cookie-flags.test.ts` bayrakların **çağrı yerinde**
  olmasını şart koşuyor. Dedektör (`lane-collisions.mjs`) çakışma bulmuyor.
- **#2:** Başlık hücresindeki boşluk `{{ if $rtl }}padding-right{{ else }}padding-left{{ end }}:14px`
  yapıldı; `fa`'da doğru tarafa kayıyor.

### Kanıt
- **Gerçek `@supabase/ssr` sınırıyla** (`applyServerStorage`):
  ```
  NODE_ENV unset      -> {"path":"/","sameSite":"lax","httpOnly":true,"maxAge":34560000,"secure":false}
  NODE_ENV=production -> {… ,"httpOnly":true,… ,"secure":true}
  ```
- `bun run test:security` → **"the Supabase session cookie is HttpOnly and Secure"**
  artık **pass** (önce `todo`).
- Şablonlar: LANE-QA renderer'ı 21/21 + yeni RTL guard'ı 6/6.

### Güvenlik değerlendirmesi (security skill)
- `HttpOnly` + `Secure` (üretim) + `SameSite=Lax` + `Path=/`. `SameSite=None` yok →
  CSRF yüzeyi artmadı.
- `maxAge` ssr varsayılanında (400 gün) bırakıldı; davranış değişmedi.
- Oturum doğrulaması zaten `getClaims()` ile yapılıyor (imza yeniden doğrulanıyor),
  ham çereze güvenilmiyor — değişmedi.
- `service_role` hiçbir değişen dosyada yok.

### Devredilen / not
- **#191** (marka paleti: site `#194435` vs e-posta `#0D5C3A`) → sahibi LANE-URUN
  (`email-layout.ts`) + LANE-TASARIM (token'lar). Şablonlarımdaki `#0D5C3A` şu an
  `email-layout.ts` ile tutarlı; #191 landığında şablonlar da aynı PR ile
  güncellenmeli (aksi halde iki sistem yine ayrışır). Bu PR'a almadım — sahibi
  farklı lane.
- **#189** (yeni pazarlama e-posta tipleri) → LANE-URUN/GEO kapsamı.

### Sahibin yapması gerekenler
- Üretimde `Set-Cookie` bayraklarını doğrula (gerçek oturum aç → `Secure; HttpOnly`).
- #167'nin `todo` testi bu PR ile geçiyor; LANE-GÜVENLİK `todo`'yu kaldırıp kapıya
  terfi ettirebilir.

---

## Çalıştırma raporu — 2026-11-05 (issue turu: #207)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: #207 (callback hata kodunu ayırt etmiyor; 5 farklı hata tek mesaj)
Değişen dosyalar:
  src/features/identity/auth-errors.ts      (+reason sözlüğü + mesaj anahtarı)
  src/features/identity/auth-routing.ts     (failure/error yolu reason taşır)
  src/app/[locale]/auth/callback/route.ts   (error.code'u iletir + log zenginleşti)
  src/app/[locale]/(auth)/login/page.tsx    (reason -> mesaj + "şifremi sıfırla")
  src/messages/{tr,en,ru,el,fa,de}.json     (+5 anahtar)
  src/features/identity/oauth-failure-reason.test.ts (yeni, 11 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (471, 11'i yeni) / test:security ✅ (35 pass, 3 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files` → **37 dosya**. Bu turda 4 kaynak + 6 katalog + 1 test dosyası
düzenlendi; kalanlar önceki turlarda denetlendi. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `auth-routing.ts:102` | hata yolu | `flow=oauth` olan **her** başarısızlık `?error=oauth` üretir; sebep kaybolur | sebebe özel reason | Kullanıcı "tekrar deneyin" görür, hesabı olduğunu anlamaz → sonsuz döngü | düzeltildi |
| 2 | `auth/callback/route.ts:115` | hata yolu | `error.code` loglanır ama URL'e taşınmaz | reason olarak taşınır | Aynı mesaj 5 farklı hatada | düzeltildi |
| 3 | `login/page.tsx:69` | doğruluk | Tek `oauthMessage` anahtarı | reason'a göre 5 mesaj | Teşhis edilemez UX | düzeltildi |
| 4 | `login/page.tsx` | UX | "Hesap zaten var" durumunda eylem yok | "Şifremi sıfırla" butonu | Kullanıcı çıkış yolu bulamıyor | düzeltildi |
| 5 | `auth-errors.ts` | — | (kendi regresyonum) reason'ı code sanıp yeniden eşlemek mesajı genele düşürüyordu | ayrı reason→mesaj eşleyicisi | Fix çalışmıyor görünürdü | düzeltildi (canlı render ile yakalandı) |

### Düzeltilen
- **Kapalı reason sözlüğü** (`oauthFailureReason`): 11 GoTrue kodu → 5 reason
  (`accountExists`, `cancelled`, `linkExpired`, `providerUnavailable`, `failed`).
  Ham kod **asla** URL'e yazılmaz (public GET, saldırgan etkili).
- `resolveAuthFailurePath(flow, locale, audience, errorCode?)` ve
  `resolveAuthErrorRedirect` reason'ı taşır; kod verilmezse **eski genel yol**
  aynen korunur (geriye dönük uyumlu).
- Callback `error.code`'u (ve `?error_code=`/`?error=`) iletir; log'a `flow`
  eklenir.
- Login sayfası reason → mesaj; `accountExists` için "Şifremi sıfırla" bağlantısı.
- 6 dile 5 yeni anahtar (4 mesaj + 1 eylem).

### Kanıt (gerçek dev sunucusu, `next dev`)
```
?error=oauth                            -> Social sign-in could not be completed. Try again…
?error=oauth&reason=accountExists       -> You already have an account with this social sign-in. Sign in below.
?error=oauth&reason=cancelled           -> Social sign-in was cancelled. You can try again.
?error=oauth&reason=linkExpired         -> The sign-in link has expired or was already used. Try again.
?error=oauth&reason=providerUnavailable -> The social sign-in provider is unavailable right now…
?error=oauth&reason=unknown             -> (genel mesaja düşer)
```
- `reason=accountExists` → render edilen "Reset my password" bağlantısı **1**;
  `cancelled`/genel → **0** (JSON payload hariç, yalnız gerçek `<a>` sayıldı).
- Callback zinciri: `/en/auth/callback?flow=oauth&error_code=access_denied` →
  `307 /en/login?error=oauth&reason=cancelled&audience=candidate`.

### Güvenlik değerlendirmesi (security skill)
- Ham `error_code` URL'e **yazılmaz**; yalnız kapalı reason sözlüğünden bir literal.
  `https://evil.example`, `//evil.example`, `../../etc/passwd`, `javascript:` gibi
  girdiler reason'a çözülmez → genel yola düşer (testle kilitli).
- Login sayfası bilinmeyen `reason`'ı genel mesaja düşürür; interpolasyon yok.
- Açık yönlendirme yüzeyi değişmedi (tüm yollar locale-prefix'li literal).
- "Hesap zaten var" mesajı hesabın varlığını söyler; bu akışta kullanıcı zaten
  kendi sağlayıcı hesabıyla geliyor → yeni enumeration yolu yok.

### Sahibin yapması gerekenler
- Gerçek LinkedIn ile "zaten kayıtlı" senaryosunu üretimde doğrula (bu sandbox'ta
  gerçek OAuth round-trip yok); beklenen: `oauthAccountExists` mesajı + buton.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu: #195 sahiplik ayrımı)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: #195 (auth e-postaları hizasız) — sahiplik ayrımı + micro-denetim
Değişen dosyalar:
  src/features/identity/new-password-form.tsx   (aria-invalid + describedby)
  src/features/identity/form-error-a11y.test.ts (yeni, 2 test)
Devredilen: #227 (LANE-SUPABASE + LANE-CLOUDFLARE)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (496, 2'si yeni) / test:security ✅ (41 pass, 2 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**' 'src/app/[locale]/(auth)/**'
'supabase/templates/**'` → **38 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### #195 — neden LANE-AUTH düzeltmedi (devir)
İki parça, ikisi de sahiplik dışı:
1. `[auth.smtp]` yok → `supabase/config.toml` **LANE-SUPABASE**'in (tablo satırı
   + AUTH brief'i: "dokunma, ihtiyacı raporla"). Kanıt: `grep -niE 'smtp'
   supabase/config.toml` → boş.
2. DKIM 1024-bit → Resend paneli + DNS; repo dosyası yok.
→ **#227** (`lane:supabase` + `lane:cloudflare` + `agent:handoff`) açıldı, kanıt
ve önerilen blok gövdesinde.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `new-password-form.tsx:33,66,118` | erişilebilirlik | Şifre alanlarında `aria-invalid` yok; hata `<p>`'inde `id` yok → alan mesaja bağlanmıyor | Diğer 3 formdaki gibi `aria-invalid` + `aria-describedby` | Ekran okuyucu "neden başarısız"ı duymaz; alan geçersiz işaretlenmez (WCAG 3.3.1/4.1.2) | düzeltildi |
| 2 | `supabase/config.toml` | e-posta teslimi | `[auth.smtp]` yok | Resend SMTP bloğu | Auth postaları hizasız → spam | devredildi (#227) |
| 3 | `turnstile.ts:8` | ölü kod | `turnstileResponseField` export'u dışarıdan okunmuyor | — | önemsiz | bilgi |
| 4 | `sign-in-form.tsx:53-66` | erişilebilirlik | Resend alt-formunun mesajında `id` yok | — | Görünür alan yok (yalnız gizli input), mesaj zaten `role=alert` → dangling ref yok | bilgi |

### Düzeltilen (#1)
`new-password-form.tsx`: iki şifre alanına `aria-invalid={state.status === "error"}`
ve hata mesajına `id="reset-new-password-message"` eklendi; alanlar
`aria-describedby`'lerine bu id'yi (ipucu id'sini kaybetmeden) ekliyor. Diğer üç
formun sözleşmesiyle aynı.

### Kanıt
- Yeni `form-error-a11y.test.ts` (2 test): dört formun tamamında alan→mesaj
  bağlantısı, `aria-invalid`, `aria-live`, `role=alert` sözleşmesini kilitler.
- `bun run test:unit` 496/496 (todo'lar QA'nın #208 izleme testleri).

### Güvenlik değerlendirmesi (security skill)
- Yalnız ARIA nitelikleri eklendi; form gönderimi/doğrulaması değişmedi.
- `aria-describedby` id'leri statik literal (kullanıcı girdisi yok).
- `service_role` hiçbir değişen dosyada yok.

### Devredilen
- **#227** → LANE-SUPABASE (`[auth.smtp]`) + LANE-CLOUDFLARE (DKIM DNS).

### Sahibin yapması gerekenler
- #227'deki `[auth.smtp]` bloğunu `config.toml`'a ekle (LANE-SUPABASE) ve
  RESEND_API_KEY'i düzelt (#186).
- DKIM'i 2048-bit'e yenile (Resend paneli) + TXT yayınla (LANE-CLOUDFLARE).

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 2)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
Değişen dosyalar:
  src/features/identity/turnstile.ts            (başarısız script retry'ı düzeltildi)
  src/features/identity/turnstile-loader.test.ts (yeni, 3 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (508, 3'ü yeni) / test:security ✅ (41 pass, 2 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**' 'src/app/[locale]/(auth)/**'
'supabase/templates/**'` → **39 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `turnstile.ts:30-55` | mantık / hata yolu | Başarısız script indirmesinden sonra `error` işleyicisi `scriptPromise=null` yapıyor ama `<script id="cf-turnstile-script">` DOM'da kalıyor. Yeniden deneme `existing` elemanı yeniden kullanıyor; settle olmuş eleman bir daha `load`/`error` **yaymaz** → promise sonsuza dek pending | Her deneme taze elemanla başlamalı | Ağ hatası/CF blokundan sonra captcha widget'ı **hiç** render olmaz; captcha açıkken kayıt/giriş/şifre sıfırlama **tamamen bloke** | düzeltildi |
| 2 | `turnstile.ts:8` | ölü kod | `turnstileResponseField` export'u dışarıdan okunmuyor (üretici/tüketici aynı dosyada sabit kullanıyor) | — | önemsiz | bilgi |
| 3 | 7 şablon | tutarlılık | logo/preheader/tablo/satır içi stil birebir aynı; tek stylesheet | — | sorun yok | bilgi |
| 4 | `auth-errors.ts` / `auth-routing.ts` | doğruluk | `oauthFailureReason` 11 kod → 5 reason; bilinmeyen/hostile girdi `failed`'a düşer, URL'e ham kod yazılmaz | — | sorun yok (önceki tur) | bilgi |

### Düzeltilen (#1)
`loadTurnstileScript`: `document.getElementById(scriptId)?.remove()` ile eski
eleman temizlenip her denemede `createElement` ile taze script ekleniyor; `error`
işleyicisi başarısız elemanı `script.remove()` ile kaldırıyor. Tek uçuş
paylaşımı (`if (scriptPromise) return scriptPromise`) ve "hazırsa DOM'a dokunma"
davranışı korundu.

### Kanıt (mutasyon testi)
Yeni `turnstile-loader.test.ts` gerçek `loadTurnstileScript`'i minimal DOM stub'ıyla
sürer. Düzeltme **geri alındığında** test kırmızı olur:
```
BUGGY  → ✖ a failed download can be retried instead of hanging forever (timeout)
FIXED  → ✔ 3/3 pass
```
Bu, testin hatayı gerçekten yakaladığını kanıtlar.

### Güvenlik değerlendirmesi (security skill)
- Değişiklik yalnız **istemci tarafı script yükleme** mantığı; sunucu/DB yolu yok.
- `scriptSrc` sabit ve Cloudflare alan adına işaret ediyor; kullanıcı girdisi
  URL'e girmiyor. `remove()` yalnız bizim oluşturduğumuz elemanı hedefler.
- Captcha açıkken form gönderimini **bloke etmeyen** davranış korundu (site key
  yoksa widget render edilmez; `useCaptchaAction` yalnız site key varken keser).

### Sahibin yapması gerekenler
- Gerçek tarayıcıda captcha'lı kayıt akışını doğrula (yerel/üretim), çünkü bu
  düzeltme istemci runtime'ında; bu sandbox'ta tarayıcı E2E captcha'sız koşuyor.
- **#227** (auth SMTP + DKIM) hâlâ LANE-SUPABASE + LANE-CLOUDFLARE'i bekliyor.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 3)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
Değişen dosyalar:
  src/features/identity/schemas.ts              (displayName: kontrol karakteri reddi)
  src/features/identity/display-name-schema.test.ts (yeni, 2 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (516, 2'si yeni) / test:security ✅ (61 pass, 2 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (33) + 4 `(auth)` route + callback +
7 şablon → **45 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `schemas.ts:25` (`displayName`) | doğruluk / sınır girdi | `z.string().trim().min(2).max(80)` kontrol karakterlerini kabul ediyor: `"\u0000\u0000"`, `"a\nb"`, `"a\tb"`, `"a\u007fb"`, `"a\u009fb"` geçiyor | POSIX `[[:cntrl:]]` reddedilmeli | **NUL** Postgres'te hiçbir karakter tipinde saklanamaz ("the character with code zero … cannot be stored", PG 8.3) → `handle_new_auth_user` INSERT'i patlar, istemcinin kabul ettiği kayıt sunucuda başarısız olur; ayrıca satır sonu/DEL/C1 ismi bozar | düzeltildi |
| 2 | `oauth-claims.ts:2` vs `schemas.ts` | tutarlılık | `deriveDisplayName` zaten `[[:cntrl:]]` siliyor ama şema kabul ediyordu → iki türetme çelişiyordu | aynı küme | İsim/kayıt tutarsızlığı | düzeltildi (#1 ile) |
| 3 | `turnstile.ts:8` | ölü kod | `turnstileResponseField` dışarıdan okunmuyor | — | önemsiz | bilgi |
| 4 | 7 şablon | tutarlılık | logo/preheader/tablo/inline stil birebir aynı, tek stylesheet | — | sorun yok | bilgi |

### Düzeltilen (#1)
`displayNameSchema` eklendi: `trim().min(2).max(80)` + `regex(/^[^\u0000-\u001f\u007f-\u009f]*$/)`.
`signUpSchema` bunu kullanır. Regex (custom `message` yerine) seçildi çünkü
`auth-messages.test.ts` bekçisi `SignInFormState` union'ını bu dosyadaki **ilk
`message` anahtarından** dilimliyor; yukarıya ikinci bir anahtar eklemek dilimi
kaydırıp bekçiyi kırıyordu (bu turda yakalandı ve düzeltildi).

### Kanıt (mutasyon testi)
`display-name-schema.test.ts` gerçek şemayı sürer:
```
BUGGY (z.string().trim().min(2).max(80))  → ✖ kontrol karakterli isim kabul ediliyor
FIXED (displayNameSchema)                 → ✔ 2/2 pass
```
NUL/LF/CRLF/TAB/DEL/C1 reddediliyor; `"Ayşe Yılmaz"`, `"Παπαδόπουλος"`, `"محمد"`,
`"😀😀"`, 80 karakterlik isim ve trim kabul ediliyor.

### Güvenlik değerlendirmesi (security skill)
- Girdi doğrulaması **sınırda** (şema) yapılıyor; sunucu action'ı zaten
  `invalidForm` döndürüyor, yani DB'ye ulaşmadan reddediliyor.
- Reddedilen küme `public.oauth_profile_claims` (SECURITY DEFINER, `search_path=''`)
  ile aynı; DB ile istemci sözleşmesi artık örtüşüyor.
- Bidi override (`U+202E`) gibi görsel-karışıklık karakterleri bu turda
  kapsam dışı bırakıldı; ayrı bir sertleştirme olarak değerlendirilebilir (bilgi).

### Sahibin yapması gerekenler
- **#227** (auth SMTP + DKIM) hâlâ LANE-SUPABASE + LANE-CLOUDFLARE'i bekliyor.
- **#191** (marka paleti) sahiplik çelişkisi (#191 yorumlarında) çözülmeli; AUTH
  şablonları `email-layout.ts` ile aynı yeşili (`#0D5C3A`) kullanıyor ve o dosya
  değişirse şablonlar da güncellenmeli.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 4)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
Değişen dosyalar:
  src/features/identity/account-panel.tsx   (monogram: surrogate-pair düzeltmesi)
  src/features/identity/monogram.ts         (yeni, saf yardımcı)
  src/features/identity/monogram.test.ts    (yeni, 3 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (521, 3'ü yeni) / test:security ✅ (67 pass, 2 todo, 0 fail)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (34) + 5 `(auth)`/callback route +
7 şablon → **46 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `account-panel.tsx:51` | doğruluk / unicode sınır girdi | Monogram `displayName.slice(0, 1)` — ilk **UTF-16 birimi**. Astral karakteri (emoji, Deseret/CJK-eklentisi) ikiye böler | ilk **kod noktası** (`[...name][0]`) | `"😀 Kahraman"` → yarım surrogate (`\uD83D`) → yerine-koyma glifi (tofu). Kullanıcının kendi adı bozuk görünür | düzeltildi |
| 2 | `schemas.ts` / `actions.ts` | doğruluk | Kayıt ismi (2–80, `[[:cntrl:]]` reddi) ve e-posta normalizasyonu doğru; i18n anahtarlarının tamamı 6 dilde var | — | sorun yok | bilgi |
| 3 | `auth-routing.ts` | mantık | `resolveAuthFailurePath` reset→`forgot-password?error=expired`, oauth→kapalı reason sözlüğü; ham kod URL'e yazılmıyor | — | sorun yok (önceki tur) | bilgi |
| 4 | 7 şablon | tutarlılık | logo/preheader/tablo/inline stil birebir aynı, tek stylesheet | — | sorun yok | bilgi |

### Düzeltilen (#1)
Monogram kuralı saf `monogramFor()` yardımcısına çıkarıldı (`[...displayName][0]?.toLocaleUpperCase() ?? ""`);
`account-panel.tsx` onu kullanır. İlk **kod noktası** alınır, böylece astral
karakter bütün kalır; boş isim boş string döner.

### Kanıt (mutasyon testi)
`monogram.test.ts` gerçek yardımcıyı sürer; `slice(0, 1)`'e geri alınınca kırmızı olur:
```
BUGGY (slice(0,1))         → ✖ lone surrogate (tofu) üretiyor
FIXED ([...name][0])       → ✔ 3/3 pass
```
Test, sonucun **tek kod noktası** olduğunu ve **lone surrogate içermediğini**
regex ile doğrular.

### Güvenlik değerlendirmesi (security skill)
- Yalnız sunum katmanı (avatar harfi); yetki/oturum/DB yolu değişmedi.
- Kullanıcı girdisi React tarafından metin olarak render ediliyor (XSS yok).
- `service_role` hiçbir değişen dosyada yok.

### Sahibin yapması gerekenler
- **#227** (auth SMTP + DKIM) hâlâ LANE-SUPABASE + LANE-CLOUDFLARE'i bekliyor.
- **#191** (marka paleti) sahiplik çelişkisi çözülmeli.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 5)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
Değişen dosyalar:
  src/features/identity/auth-errors.ts              (+same_password)
  src/features/identity/schemas.ts                  (+1 mesaj üyesi)
  src/features/identity/actions.ts                  (updatePassword kod eşler)
  src/features/identity/password-update-errors.test.ts   (yeni, 4 test)
  src/messages/{tr,en,ru,el,fa,de}.json             (+1 anahtar)
Devredilen: #271 (transactional e-posta lang/dir), #277 (weak_password koordinasyon)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (559, 4'ü yeni) / test:security ✅ (69 pass, 3 todo, 0 fail) /
  test:integration ✅ (47 — CI'ın Static işinde koşan adım)
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (36) + 5 `(auth)`/callback route +
7 şablon → **48 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `actions.ts:363-366` | hata yolu | `updateUser` hatası **her zaman** `passwordUpdateFailed` ("tekrar deneyin") | `same_password` kendi mesajına eşlenmeli | Kullanıcı aynı şifreyi tekrar dener → aynı hata; döngü | düzeltildi |
| 2 | `auth-errors.ts:24` | doğruluk | `same_password` haritada yok | haritada olmalı | (yukarıdaki ile aynı) | düzeltildi |
| 6 | `tests/integration/credential-boundary.test.ts:102` (LANE-QA) | koordinasyon | `weak_password`'ı "jenerik hata" örneği olarak kullanıyor | — | `weak_password` eşlemesi bu testi kırar | devredildi (#277) |
| 3 | `email-layout.ts:169` (sahiplik dışı) | erişilebilirlik/RTL | `<html lang="tr">` sabit, `dir` yok | locale'e göre lang+dir | Farsça/Almanca mail Türkçe okunur; RTL bozuk | devredildi (#271) |
| 4 | 7 şablon | tutarlılık | logo/preheader/tablo/inline stil birebir aynı, tek stylesheet; preheader konuyu tekrarlıyor ama konu marka önekli → tam kopya değil | — | sorun yok | bilgi |
| 5 | `use-captcha-action.ts` / `turnstile.ts` | mantık | başarısız script retry'ı düzeltilmiş; reset tek-uçuş paylaşımı doğru | — | sorun yok | bilgi |

### Düzeltilen (#1, #2)
`authErrorMessages`'a `same_password → passwordUnchanged` eklendi; `updatePassword`
artık `messageForAuthErrorCode(error.code, "passwordUpdateFailed")` kullanıyor.
`SignInFormState.message` union'ına bir üye, 6 dile bir anahtar eklendi.
Kardeş durum `weak_password` **bilerek dışarıda**: eşlemesi LANE-QA'nın
integration testini kırdığı için #277 ile koordine edilmeli.
auth-js kaynağı doğrulandı: `_updateUser` `AuthError`'ı **döndürür** (fırlatmaz),
yani `error.code` doğru okuma yeri.

### Kanıt (mutasyon testi)
`password-update-errors.test.ts`; düzeltme geri alınınca kırmızı olur:
```
BUGGY (hardcoded passwordUpdateFailed) → ✖ "reads the error code" fail
FIXED                                  → ✔ 4/4 pass
```

### Güvenlik değerlendirmesi (security skill)
- Yalnız hata mesajı eşlemesi; yetki/oturum/DB yolu değişmedi.
- Mesajlar kullanıcıya "neden" söyler, hesap varlığını sızdırmaz (kullanıcı zaten
  kendi oturumunda).
- `service_role` hiçbir değişen dosyada yok.

### Sahibin yapması gerekenler
- **#271** → LANE-URUN: transactional e-posta kabuğuna `locale`+`dir`.
- **#277** → LANE-QA + LANE-AUTH: `weak_password` eşlemesi (test örnek kodu).
- **#227** (auth SMTP + DKIM) hâlâ LANE-SUPABASE + LANE-CLOUDFLARE'i bekliyor.
- **#191** (marka paleti) sahiplik çelişkisi çözülmeli.

---

## Çalıştırma raporu — 2026-11-05 (issue turu: #280)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: #280 (auth sayfaları ana sayfanın title/description/social card'ını yayınlıyor)
Değişen dosyalar:
  src/features/identity/auth-metadata.ts          (yeni, saf metadata üreticisi)
  src/features/identity/auth-metadata.test.ts     (yeni, 5 test)
  src/app/[locale]/(auth)/login/page.tsx          (generateMetadata)
  src/app/[locale]/(auth)/register/page.tsx       (generateMetadata)
  src/app/[locale]/(auth)/forgot-password/page.tsx(generateMetadata)
  src/app/[locale]/(auth)/reset-password/page.tsx (generateMetadata)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (575, 5'i yeni) / test:security ✅ (75 pass, 2 todo, 0 fail) /
  test:integration ✅ (47) / production build ✅
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (36) + 5 `(auth)`/callback route +
7 şablon → **48 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | 4 `(auth)` page.tsx | SEO/doğruluk | `export const metadata = noIndexMetadata` — yalnız `robots` içerir, gerisi `[locale]/layout.tsx`'in `Meta` bloğundan miras | sayfanın kendi title/description/social card'ı | Sekme "giriş" yerine ana sayfayı söyler; paylaşılan giriş linki **ana sayfa kartı** olarak unfurl edilir | düzeltildi |
| 2 | `auth-metadata.ts` | — | (yeni) paylaşılan sosyal görsel/`og:locale`/kanonik üretir | — | — | eklendi |
| 3 | 7 şablon / `turnstile.ts` / `actions.ts` | tutarlılık | önceki turlarda doğrulanan durum korunuyor | — | sorun yok | bilgi |

### Düzeltilen (#1)
Dört rotaya da kendi `generateMetadata`'sı eklendi; ortak üretim
`createAuthPageMetadata()` (`src/features/identity/auth-metadata.ts`) içinde:
- başlık/açıklama sayfanın **kendi çeviri bloğundan** (`AccountPages.login.<audience>`,
  `.register`, `.reset`, `.resetPassword`) — login `?audience=`'ı izler;
- `robots: noIndexMetadata.robots` **korunur** (noindex/nofollow/noimageindex);
- kanonik **mutlak string** (URL instance tuzağından kaçınıldı);
- `og:title/description/url/locale` + `twitter:*` sayfanın kendi metniyle;
- sosyal görsel ve `og:locale` `@/lib/seo` paylaşılan yardımcılarından.
Başlıklar cümle olarak yazıldığı için (`.`) sondaki nokta `<title>`'da kırpılır.

### Kanıt (production standalone sunucu)
Önce (ana sayfa metni):
```
/en/login      <title>İşBul KKTC — Jobs and Vacancies in Northern Cyprus (TRNC)</title>
/de/forgot-password  <title>İşBul KKTC — Stellenangebote und Jobs in Nordzypern</title>
```
Sonra:
```
/en/login                  <title>Return to your candidate profile · İşBul KKTC</title>
/en/login?audience=employer<title>Continue to your company registration · İşBul KKTC</title>
/de/forgot-password        <title>Passwort zurücksetzen · İşBul KKTC</title>
/de/reset-password         <title>Legen Sie Ihr neues Passwort fest · İşBul KKTC</title>
canonical = https://isbulkktc.com/{locale}/<path>
robots = noindex, nofollow + googlebot noindex, nofollow, noimageindex  (korundu)
og:image/twitter:image = /images/og-cover.webp   og:locale = en_GB / de_DE
```
Yeni `auth-metadata.test.ts` (5 test) sözleşmeyi kilitler: robots, mutlak kanonik,
paylaşılan görsel/locale, dört rotada `generateMetadata` (ve `export const metadata`
YOK), login'in audience'a göre başlık üretmesi.

### Güvenlik değerlendirmesi (security skill)
- `noindex, nofollow, noimageindex` aynen korundu → auth sayfaları indekslenmez.
- Kanonik string, kullanıcı girdisi içermez (locale `routing.locales` ile doğrulanır,
  pathname literal).
- Yeni dosyalarda `service_role`/sır yok; client sınırı testi yeşil.

### Sahibin yapması gerekenler
- **#280** kabul ölçütü: gerçek tarayıcıda sekme başlığını ve paylaşım önizlemesini
  doğrula (yerel standalone'da doğrulandı).
- **#271** (transactional e-posta `lang`/`dir`) ve **#277** (`weak_password`) devirde.
- **#227** (auth SMTP + DKIM) LANE-SUPABASE + LANE-CLOUDFLARE bekliyor.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 7)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
Değişen dosyalar:
  src/features/identity/auth-metadata.ts       (RSS autodiscovery geri eklendi)
  src/features/identity/auth-metadata.test.ts  (+1 assert)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (594) / test:security ✅ (77 pass, 2 todo, 0 fail) /
  test:integration ✅ (48) / production build ✅
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (39) + 5 `(auth)`/callback route +
7 şablon → **51 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `auth-metadata.ts:45` | link bütünlüğü / regresyon | Önceki turda eklediğim `alternates: { canonical }` — Next `alternates`'i **bütünüyle** değiştirir, layout'un RSS autodiscovery `<link>`'i auth sayfalarından düşer | canonical + `types: {"application/rss+xml": "/feed.xml"}` | Auth sayfalarından feed keşfi kaybolur (önceki turda layout sağlıyordu) | düzeltildi |
| 2 | 7 şablon | RTL/tutarlılık | Yönlü boşluk `{{ if $rtl }}padding-right{{ else }}padding-left{{ end }}`; tek paylaşılan stylesheet | — | sorun yok | bilgi |
| 3 | `oauth-providers.ts` | doğruluk | `resolveEnabledOAuthProviders` bozuk env'i boş listeye indirir | — | sorun yok | bilgi |

### Düzeltilen (#1)
`createAuthPageMetadata` artık `alternates`'i `{ canonical, types: { "application/rss+xml": "/feed.xml" } }`
olarak veriyor — layout'un sağladığı RSS keşif bağlantısını korur.

### Kanıt (production standalone sunucu + mutasyon)
```
BEFORE (canonical only):  /en/login  → RSS <link> YOK
AFTER  (canonical+types): /en/login  → <link rel="alternate" type="application/rss+xml" href="https://isbulkktc.com/feed.xml"/>
                          canonical = https://isbulkktc.com/en/login
                          robots = noindex, nofollow (+ googlebot noimageindex)   (korundu)
```
`auth-metadata.test.ts` mutasyonla doğrulandı: `types` kaldırılınca test kırmızı,
geri eklenince yeşil.

### Güvenlik değerlendirmesi (security skill)
- `noindex, nofollow, noimageindex` aynen korundu.
- Yalnız `<head>` metadata'sı; yetki/oturum/DB yolu değişmedi.

### Sahibin yapması gerekenler
- **#271** (transactional e-posta `lang`/`dir`) ve **#227** (auth SMTP + DKIM) devirde.

---

## Çalıştırma raporu — 2026-11-05 (micro-denetim turu 8)

```
Lane: LANE-AUTH            Branch: lane/auth            PR: <açılacak>
Aldığı issue: yok (yeni sahipsiz lane:auth issue'su yok) → micro-denetim
              (bulgu #161'in "gecikme" başlığının kalan kök nedeni)
Değişen dosyalar:
  src/app/[locale]/auth/callback/route.ts        (welcome maili `after()`'a alındı)
  src/features/identity/callback-mail-timing.test.ts (yeni, 2 test)
Çalıştırılan kontroller: lint ✅ / typecheck ✅ / check:frontend-source ✅ /
  test:unit ✅ (610, 2'si yeni) / test:security ✅ (78 pass, 3 todo, 0 fail) /
  test:integration ✅ (48) / production build ✅
Canlıya dokundu mu: hayır (Supabase'e yazılmadı; config/migration/şablon değişmedi)
```

### Denetlenen dosyalar (micro-denetim)
`git ls-files 'src/features/identity/**'` (39) + 5 `(auth)`/callback route +
7 şablon → **51 dosya**; hepsine bakıldı. Bakılmayan dosya yok.

### Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `auth/callback/route.ts:221,235` | performans / mantık | Yeni hesabın hoş geldin maili (`sendWelcomeEmail` → Resend HTTPS çağrısı) redirect'ten **önce `await`** ediliyordu | yanıt gönderildikten sonra (`after()`) çalışmalı | Sağlayıcı yavaşken kullanıcı panoya gitmeden önce saniyelerce bekler — #161'in "gecikmeli" semptomunun kalan kök nedeni | düzeltildi |
| 2 | `displayNameSchema` | doğruluk/sınır | zod `min/max`'ı **kod noktası** sayar (PG `char_length` gibi); astral isimlerde uyumsuzluk yok | — | sorun yok | bilgi |
| 3 | 7 şablon | tutarlılık | Etiket dengesi temiz, tek paylaşılan stylesheet, RTL-aware boşluk | — | sorun yok | bilgi |

### Düzeltilen (#1)
`greetNewAccount` (async) → `scheduleWelcomeEmail` (senkron, `after()` ile
sarar). İki çağrı yeri de güncellendi. `after()` Next'in route handler'larda
desteklediği API; yanıt gönderildikten sonra çalışır, hata yakalama ve
best-effort davranışı korunur.

### Kanıt
- `callback-mail-timing.test.ts` (statik bekçi): GET handler içinde
  `await sendWelcomeEmail`/`await greetNewAccount` **yasak**, `scheduleWelcomeEmail`
  çağrısı zorunlu, `after()` içinde send var, scheduler senkron. Düzeltme geri
  alınınca test kırmızı olur (mutasyonla doğrulandı).
- Production standalone sunucu: `/en/auth/callback?flow=oauth&next=candidate`
  → `307 /en/login?error=oauth&audience=candidate` (davranış korundu);
  build ✅.

### Güvenlik değerlendirmesi (security skill)
- Yalnız zamanlama; yetki/oturum/DB yolu değişmedi. `after()` yanıt sonrası
  çalışır ama request bağlamını (cookies/headers) korur — route handler'da
  desteklenir.
- Mail hatası yine yutulur (yanıt sonrası task'tan throw etmez).

### Sahibin yapması gerekenler
- **#161**'in "gerçek hesapla üretimde doğrulama" kalemi hâlâ insan gerektiriyor.
- **#271** (transactional e-posta `lang`/`dir`) ve **#227** (auth SMTP + DKIM) devirde.
