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
