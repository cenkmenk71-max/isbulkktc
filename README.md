# isbulkktc

KKTC odaklı iş arama ve işe alım platformu. **Geçerli tek kaynak V4 mimarisidir:**
verilen yeni şartnamenin eksiksiz kopyası [`docs/architecture-v4.md`](docs/architecture-v4.md),
güncel kararlar ve uygulama durumu ise [`docs/architecture.md`](docs/architecture.md)
içindedir. Eski şartname projeden kaldırılmıştır. V4 bir hedef mimaridir; hiçbir
üretim/güvenlik kabul kapısı test kanıtı olmadan geçmiş sayılmaz.

## Gereksinimler

- Node.js 24 LTS (sürüm `24.x`; yerel geliştirmede `.nvmrc` ile sabitlenir)
- Bun 1.4 veya üstü (kilitli bağımlılık kurulumu ve güvenlik denetimi için)
- Supabase yerel geliştirmesi için Docker Engine (Docker Desktop veya WSL2
  Ubuntu içinde) ve Supabase CLI (isteğe bağlı)

## Başlangıç

```powershell
bun install --frozen-lockfile
Copy-Item .env.example .env.local
bun run dev
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde açılır. Supabase
ve dış servisler için `.env.local` değerlerini kendi geliştirme ortamınızda
doldurun; gizli anahtarları kaynak denetimine eklemeyin.

## Yararlı komutlar

```powershell
bun run lint
bun run typecheck
bun run test:unit
bun run security:audit
bun run db:start
bun run test:db
bun run db:stop
bun run test:e2e
bun run build
```

`db:start` ve `test:db` için erişilebilir bir Docker Engine gerekir. Bu Windows
projesinde Supabase CLI proje bağımlılığıdır; WSL2 Ubuntu Docker motorunu
kullanmak için ayrıca proje içindeki Linux CLI'yı bir kez kurun:

```powershell
bun run tools:supabase-wsl
bun run db:start
bun run test:db
bun run db:stop
```

İlk Playwright kullanımından önce tarayıcıyı D: sürücüsündeki proje önbelleğine
kurun ve aynı PowerShell oturumunda çalıştırın:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.tools\playwright-browsers"
bunx playwright install chromium
bun run test:e2e
```

Geliştirme sırasında DB gerekirse `bun run db:start` çalıştırın. Sign-in/signup
ve oturum korumalı sayfalar için çalışan yerel Supabase gerekir;
`.env.example` değerlerini çalışan yerel Supabase
anahtarlarıyla `.env.local` dosyasına girin; `NEXT_PUBLIC_APP_URL` değerini
dağıtımın HTTPS kökeniyle eşleştirin. Bu köken canonical/hreflang ve sosyal
paylaşım metaverisini, `sitemap.xml`, `robots.txt` ve auth callback'lerini
belirler; dağıtım URL'si kaynak koda sabitlenmez. E-posta doğrulama bağlantıları
`/auth/callback` uç noktasından güvenli biçimde oturuma çevrilir. Gerçek IBAN,
ödeme, AI, Bakanlık API'si, sosyal giriş ve CV/dekont upload/indirme, işletme
politikaları ve güvenli operasyon onaylanana kadar devre dışıdır.

## Analitik (Google Analytics)

GA4 ölçümü kod tarafında hazırdır (`GoogleAnalyticsConsent`) ve yalnızca
`NEXT_PUBLIC_GA_MEASUREMENT_ID` ortam değişkeni tanımlıysa **ve** ziyaretçi çerez
onayını verdiyse yüklenir. Üretimde etiket görünmüyorsa değişken tanımlı
değildir; ekleyip **yeniden dağıtmanız** gerekir (`NEXT_PUBLIC_*` derleme anında
koda gömülür). Adım adım kurulum, doğrulama ve sorun giderme:
[analitik runbook'u](docs/runbooks/analytics.md).

## Kaynak ilan kataloğu ve sitemap

Zamanlanmış `refresh-source-jobs` workflow'u kaynak ilanları çeker ama varsayılan
olarak **en yeni 21 ilanı** yayınlar (`SOURCE_JOB_LIMIT`, repo değişkeni). Sitemap
yayınlanan kataloğu listeler; sayı düşükse bu bir hata değildir. Limiti
yükseltmek için kod değişikliği gerekmez: GitHub → Settings → Variables →
`SOURCE_JOB_LIMIT`. Ayrıntı ve indeksleme kontrol listesi:
[kaynak ilan kataloğu runbook'u](docs/runbooks/source-job-catalogue.md).

VS Code/Copilot workspace talimatları, beceriler, Context7 MCP, önerilen
eklentiler ve proje kapsamındaki D: araç kurulumu için
[geliştirici araçları rehberine](docs/developer-tooling.md) bakın.
