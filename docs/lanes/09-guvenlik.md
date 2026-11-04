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
