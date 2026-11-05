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
