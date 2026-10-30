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
