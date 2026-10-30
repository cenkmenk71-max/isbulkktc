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
