# D: sürücüsündeki proje geliştirme araçları

Bu kurulum VS Code + Copilot workspace/Agent Host için proje kapsamlıdır.
Küresel VS Code profiline, kullanıcı MCP yapılandırmasına, sistem PATH'ine veya
kullanıcı sırlarına dokunmaz. Yetkili ürün mimarisi hâlâ
[`architecture-v4.md`](./architecture-v4.md)'dir.

## Projeyle birlikte gelenler

- [`.github/copilot-instructions.md`](../.github/copilot-instructions.md): V4,
  güven sınırları, Next.js 16 ve doğrulama kurallarını tüm workspace işleri
  için kısa biçimde uygular.
- [`.github/instructions/`](../.github/instructions/): Next.js 16, Supabase
  SQL/RLS ve test dosyalarına göre yüklenen dar kapsamlı talimatlar.
- [`.github/skills/`](../.github/skills/): `next16-app-router`,
  `v4-database-workflow`, `project-e2e` ve `deep-audit` iş akışları. Skill
  içerikleri ihtiyaç oldukça yüklenir; her sohbete topluca eklenmez.
- [`.agents/skills/playwright-cli/`](../.agents/skills/playwright-cli/SKILL.md):
  Playwright'ın resmi CLI agent skill'i; browser araçlarını context-efficient
  biçimde kullanır ve `@playwright/cli` ile aynı sürümde tutulur.
- Playwright CLI browser kayıtları `.playwright-cli/`, E2E çıktıları ise
  `.playwright/` altında tutulur; her iki dizin de Git ve VS Code arama/
  Explorer görünümünden hariçtir.
- [`.github/agents/v4-reviewer.agent.md`](../.github/agents/v4-reviewer.agent.md):
  komut çalıştırmayan, salt-okunur V4 inceleyicisi.
- [`.mcp.json`](../.mcp.json): güncel kütüphane dokümantasyonu için yalnız
  Context7 HTTP MCP. Uzak servise sadece sorulan doküman sorgusu gönderilmelidir;
  proje kaynak kodu, sır veya özel kullanıcı verisi prompta eklenmemelidir.
  Kütüphane API/config araştırmasında ajandan `use context7` isteyin.
- [`.vscode/extensions.json`](../.vscode/extensions.json): workspace için
  önerilen eklentilerin kaynağıdır. `npm run tools:vscode-extensions` listedeki
  eklentileri workspace'in `.tools/vscode-extensions/` dizinine kurar ve
  kurulumlarını doğrular; Tailwind, ESLint ve Playwright sürümleri sabittir,
  diğer öneriler Marketplace'in güncel sürümüyle kurulur. Eklentiler kullanıcı
  profiline yazılmaz. `npm run vscode:open`, VS Code'u workspace'e özel uzantı
  ve kullanıcı-data diziniyle açar. Kurulum sırasında bu VS Code penceresi
  açıksa, eklentilerin yüklenmesi için pencereyi kapatıp `npm run vscode:open`
  ile yeniden açın. Bu yalıtılmış profilde Copilot kullanmak
  için GitHub'da ayrıca oturum açın. Bu makinedeki VS Code, GitHub Copilot Chat
  işlevini yerleşik `GitHub.copilot-chat@0.69.0` olarak içerir; Marketplace'in
  eski `0.48.1` sürümüyle yerleşik eklentinin üzerine yazılmaz/geriletilmez.
  Uzantı kimlikleri resmi Marketplace'te kontrol edilmiştir. Ancak mevcut VS
  Code 1.141.0 extension-host günlüğü yerleşik Copilot Chat için `authIssuers`
  API uyumsuzluğu kaydetti; bu uygulama/eklenti uyumsuzluğu workspace
  ayarlarından düzeltilemez. VS Code uygulama dosyaları ve kullanıcı profili
  değiştirilmedi; bu nedenle bu host'ta Copilot Chat işlevi doğrulanmış değildir.
  Resmi stable güncelleme kaynağı da aynı 1.141.0 sürüm ve commit'i gösterdiği
  için projeye aynı derlemenin bir kopyası kurulmadı. Marketplace sorgusu
  `0.48.1` sürümünü döndürdü; `0.69.0` yerleşik paketten eski olduğundan
  downgrade yapılmadı.
- Bu makinede Git çalıştırılabilir dosyası PATH'te bulunmadı. Proje dizini de
  Git deposu olarak başlatılmamış. `npm run tools:git`, resmî MinGit arşivini
  sabit `2.56.0.windows.2` sürümü ve SHA-256 doğrulamasıyla `.tools/git/` altına
  kurar; bu sistem PATH'ini veya Git deposu durumunu değiştirmez. Workspace
  `git.path` ayarı bu doğrulanmış ikiliyi seçer; `npm run vscode:open` ayrıca
  PATH'i yalnız açtığı proje kapsamlı VS Code sürecine ekler. Workspace
  terminalleri de Git'e PATH üzerinden erişir. Depo ayrıca açıkça
  başlatılmadıkça Git kaynak denetimi için depo oluşturulmaz.
- `supabase` CLI ve `@playwright/cli`, tam sürümle D: üzerindeki `devDependencies`
  olarak kilitlenir. `npm run test:db`, gerçek yerel Supabase/pgTAP testidir.
  Windows'ta npm DB komutları Ubuntu 24.04 WSL2 içindeki Docker Engine/Compose
  ve `.tools/supabase-wsl/` altındaki aynı sürüm Linux CLI'yı kullanır.
- `npm run security:audit`, runtime bağımlılıklarını CI'da tarar. Denetim
  sırasında production audit temizdi; tam npm audit çıktısındaki yüksek
  uyarılar yalnız build/asset geliştirme bağımlılık zincirlerindedir. Npm
  registry bu zincirlerin yamalı sürümlerini henüz sunmadığından bunları major
  downgrade veya güvenli olmayan override ile geçiştirmeyin.
- Next.js 16.4'ün kurulu ESLint rehberi ESLint 9 ve 10'u destekler; ESLint 10
  kullanılır. Rehberin de belirttiği gibi, Next config içindeki bazı eklentiler
  peer aralığını henüz 10'a genişletmediğinden npm kurulumunda peer uyarısı
  görülebilir. `npm ls`, lint ve CI kurulum/test kapıları ayrıca doğrulanmalıdır.

## MCP güvenlik kararı

Hosted Supabase MCP, GitHub MCP ve genel dosya sistemi MCP'si bilerek
yapılandırılmamıştır. Bu workspace'in proje/ref kimliği ve üretim erişim izni
henüz belirlenmedi; bunları eklemek yanlışlıkla uzak veriye/üretime erişim ya da
fazla geniş araç yetkisi riski yaratır. Gerekli erişim ve hedef netleştiğinde
yalnız yerel/test Supabase için daraltılmış bağlantı ayrıca yapılandırılabilir.

## İlk doğrulama

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run security:audit
npm run tools:vscode-extensions
npm run vscode:open
npm run test:e2e
npm run build
```

Yerel Supabase CLI:

```powershell
npm run db:start
npm run db:status
npm run test:db
npm run db:stop
```

Geliştirme sunucusu, tarayıcı ve npm önbelleği [VS Code workspace
ayarlarında](../.vscode/settings.json) D: sürücüsüne yönlendirilir. Windows'ta
terminal değişikliklerinin etkinleşmesi için VS Code'da yeni bir terminal açın.

### Windows yerel DB ve dış terminal

Supabase'in gerçek yerel Auth/PostgreSQL/Storage/pgTAP testi Docker Engine
gerektirir. Bu Windows makinesinde Docker Desktop yerine Ubuntu 24.04 WSL2
içinde çalışan Docker Engine ve Compose kullanılır; Windows Docker Desktop
veya makine geneli PATH/eklenti kurulumu gerekmez. Önce şu komutlarla daemon'ı
doğrulayın ve proje kapsamlı, sabit sürümlü Linux CLI'yı kurun:

```powershell
wsl -d Ubuntu-24.04 -- docker info --format '{{.ServerVersion}}'
wsl -d Ubuntu-24.04 -- docker compose version --short
npm run tools:supabase-wsl
npm run db:start
npm run test:db
npm run db:stop
```

`tools:supabase-wsl` CLI arşivini Supabase'in resmi GitHub release'inden alır,
sabit SHA-256 (`7074584113aa00495beeac661c41fb09f1ddd0a483cd7333894b0d080086dc6e`)
ile doğrular ve yalnız `.tools/supabase-wsl/` altına kurar. Windows'taki
`db:start`, `db:status`, `test:db`, `db:stop` komutları aynı WSL Ubuntu'ya ve
`/mnt/d/isbulkktc` yoluna yönlendirilir. `ISBULKKTC_WSL_DISTRO` farklı Ubuntu
dağıtım adı kullanılması gerektiğinde seçilebilir; seçilen dağıtımda Docker
Engine, Compose ve kullanıcı Docker erişimi önceden çalışıyor olmalıdır.
İlk çalıştırma Supabase container image'larını indirebilir. Bu nedenle disk ve
container kullanımı yeni Docker Desktop kurulumunun aksine mevcut WSL motoruna
aittir. `.github/workflows/ci.yml` de CLI sürümünü kilitleyip aynı npm DB
komutlarını Ubuntu runner'da kullanır.

İlk DB kapısı denemesi Windows Supabase CLI ile başarısızdı: Windows tarafında
Docker CLI bulunmuyor ve 54322 kapalıydı. Denetimde Ubuntu 24.04 WSL2 içinde
Docker Engine 29.8.1, Compose 5.5.1 bulundu; başlangıçta bu projeye ait
Supabase container'ı yoktu. Proje içindeki sabit sürümlü WSL CLI kurulduktan
sonra `npm run db:status` başarılı oldu ve `npm run test:db` gerçek Supabase
pgTAP testini geçirdi: 1 SQL dosyası, 20 test, `Result: PASS`.

VS Code workspace ayarı `PLAYWRIGHT_BROWSERS_PATH` değişkenini proje
`D:\isbulkktc\.tools\playwright-browsers` deposuna ayarlar. Dış PowerShell
terminalinde Playwright testlerini çalıştırırken de aynı değişkeni verin:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\playwright-browsers"
npm run test:e2e
```

Değişken ayarlanmadan çalıştırılan Playwright, varsayılan olarak kullanıcı
profilindeki browser deposuna bakar; bu workspace kurulumu o konuma browser
kurmaz.
