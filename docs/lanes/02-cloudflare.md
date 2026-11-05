# LANE-CLOUDFLARE — edge/WAF/cache/DNS/Bot koruması

Hedef: Cloudflare yapılandırmasını **noktası noktasına** doğrulayıp eksikleri kapatmak.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- Alan: **isbulkktc.com** Cloudflare arkasında. Vercel alias: `isbulkktc-amber.vercel.app`.
- Çalışan token: **`<CF_API_TOKEN — ortam değişkeni>`** (cfat_ biçimli). `/user/tokens/verify` `1000 Invalid API Token` döner ama token çalışır — yok say.
- **Kanıtlanmış gerçekler:** WAF AÇIK (Managed Free Ruleset, 38 kural). Custom WAF 4 kural (ruleset `e2951dca01da47b8882fa120d5fbc308`): `/api/devtools/` bloğu, TRACE/TRACK, VCS/dotfile/secret yolları, CMS/exploit-scanner yolları. Free plan `matches` operatörünü reddeder (`contains`/`in`/`lower()` kullan).
- **Free plan = tam 1 `http_ratelimit` kuralı**, "Leaked credential check" için harcanmış. Auth brute-force koruması bunu **değiştirmeyi** gerektirir → önce sor.
- **GitHub runner egress'ini Cloudflare `cf-mitigated: challenge` ile her yolda engelliyor** (ana sayfa dahil). Custom WAF skip bunu kaldırmıyor. Bu yüzden IndexNow Vercel alias'tan okuyor.
- Cache doğru: dinamik HTML `private, no-cache, no-store`; yalnız `/robots.txt` ve `/images/*` edge-cached. **"Düzeltme".**

## Sahip olduğun yollar
Repo dışı CF API; gerekirse yeni `docs/cloudflare.md` (kendi dosyan).

## Yapılacaklar (nokta noktasına denetim)
1. **DNS:** A/CNAME kayıtları, proxied durum, TTL, `www` yönlendirmesi, mail kayıtları (SPF/DKIM/DMARC).
2. **SSL/TLS:** mod (Full strict mi?), min TLS sürümü, HSTS, Always Use HTTPS, Automatic HTTPS Rewrites.
3. **Cache Rules:** hangi yollar edge-cached; `Vary`, `s-maxage`; `/jobs` gibi dinamik yollar asla cache'lenmiyor mu?
4. **WAF:** mevcut 4 kural + managed ruleset; bypass/skip mantığında delik var mı? Negatif test (9 saldırı yolu → 403, 17 meşru rota → 200) tekrarla.
5. **Bot koruması:** Bot Fight Mode / Verified Bots; GH runner engeli **bilinçli bir trade-off** — kapatmadan önce etkisini raporla.
6. **Rate limit:** tek kuralı nereye harcamak en doğru (auth brute-force vs leak check)? Öneri sun, uygulamadan sor.
7. **Analytics/logpush:** token `account.zone.analytics.read` istiyor; eksik scope'u net söyle.

## Kurallar
- **Yıkıcı CF değişikliği (cache purge, DNS, WAF kuralı silme) öncesi sahibin onayını al.** Read-only denetim + öneri önce gelsin.
- Her iddiayı **canlı HTTP kanıtıyla** doğrula (curl -I, cf-ray, cf-cache-status).
- Token'da olmayan yetkileri (DNS/cache/zone-write) listele: hangi scope gerektiğini tam adıyla yaz.

## Raporla
Bulgu tablosu (nokta → mevcut → olması gereken → kanıt) + uygulanacak değişiklikler (onay bekleyen) + eksik token scope'ları.

## Durum (2026-11-05)

Read-only denetim yapıldı; bulgular `docs/cloudflare.md`'de. Özet:

- **Token yok:** bu sandbox'ta `CF_API_TOKEN` tanımlı değil → zone-level API
  denetimi (WAF ruleset, cache rules, rate-limit kuralı, Bot Management,
  Analytics) yapılamadı; canlı HTTP + DNS kanıtı toplandı.
- **Doğrulanan gerçekler:** WAF saldırı yollarını 403'ler (case/kaçış denemeleri
  dahil), meşru aramalarda yanlış pozitif yok, TLS min 1.2, HSTS+preload,
  DNSSEC açık, dinamik HTML asla cache'lenmiyor. Cache "düzeltmesi" **gerekmiyor**.
- **Yeni bulgu (F-08):** `isbulkktc-amber.vercel.app` CF edge'ini tamamen atlıyor
  → WAF/bot/rate-limit devre dışı kalıyor. Vercel Deployment Protection önerisi
  (sahip/INFRA onayı).
- **Onay bekleyen:** (1) tek rate-limit kuralını auth brute-force'a tahsis,
  (2) origin doğrudan erişimini kapat, (3) DMARC `p=none` → `quarantine/reject`,
  (4) HSTS preload `pending` iken DNS/TLS'e dokunma.

### Bulunabilirlik (#163) — 2026-11-05

Issue #163'ün **Cloudflare halkası** ölçüldü: CF arama motoru botlarını
engelliyor mu? **Hayır.** Sitemap'teki 207 URL'nin tamamı Googlebot UA'ya 200
döndü; bingbot/YandexBot/GPTBot/ClaudeBot/AhrefsBot de 200; hiçbir yolda
`cf-mitigated` yok; site geneli `X-Robots-Tag` yok; `robots.txt`/`sitemap.xml`
bot-bağımsız aynı; WAF yalnız `sqlmap` gibi kötü UA'yı 403'lüyor. Yani
"sıralanmama"nın nedeni bot engeli değil. Detay + kanıt: `docs/cloudflare.md`
→ "Bulunabilirlik denetimi".

**Kopuk halka adayı (LANE-SEO'ya handoff):** Bing doğrulama artefaktı yok
(`msvalidate.01` meta, `BingSiteAuth.xml`, Bing DNS TXT'inin üçü de eksik) —
Bing indeksi 1 sayfada. `lane:seo` + `agent:handoff` ile issue açıldı.
