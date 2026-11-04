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
