# Lane orchestration — isbulkktc "top seviye" programı

Her lane = **ayrı bir Agent Canvas chat'i** (kendi sandbox'ı, kendi klonu).
Bu dosya kuralları ve sırayı tanımlar. Bir lane'in brief'i `docs/lanes/<ad>.md`'de.

## Değişmez kurallar (her lane)

1. **`main`'e asla push/merge yok.** Her lane kendi branch'ini açar, PR açar. Merge = sahibin kararı.
2. **Canlı Supabase'e aynı anda SADECE BİR lane yazar.** DB yazan tek lane: **LANE-SUPABASE**.
   Diğer lane'ler SQL'i branch'te/migration taslağı olarak taşır, canlıya uygulamaz.
3. **Her lane ayrık dosya setine sahiptir.** Aynı dosyaya iki lane dokunmaz.
4. **Her lane CI'ı yeşile getirir** (lint, typecheck, check:frontend-source, test:unit; ilgiliyse build/e2e).
5. **Her lane notlarını `docs/lanes/<ad>.md`'ye yazar** — ortak `MEMORY.md`'ye değil (çakışma olmasın).
6. **Kod/PR'dan önce `git status -sb`** ve kendi branch'inde çalış.
7. Gizli anahtar/şifre commit'lenmez; `.env.local` gitignored kalır.

## Kaynak sahipliği (çakışma olmasın diye)

> **Tek kural: bir dosyanın TEK sahibi olur. Bir lane, sahibi olmadığı dosyayı
> DÜZENLEMEZ — ihtiyacı varsa rapor eder (TODO) ve dosya sahibi uygular.**
> `git commit` öncesi `git status` bak: kendi sahiplik listende olmayan dosya
> kirliyse commit'leme (başka lane'in işidir).

| Lane | Sahip olduğu yollar (SADECE bunlara yazar) |
|---|---|
| LANE-SUPABASE | `supabase/**` (migrations, tests, seed, config.toml), `docs/lanes/01-supabase.md` |
| LANE-CLOUDFLARE | repo dosyası YOK (CF API); isterse `docs/cloudflare.md`, `docs/lanes/02-cloudflare.md` |
| LANE-SEO | `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/[locale]/**`, `!src/app/[locale]/auth/**`, `docs/lanes/03-seo.md` |
| LANE-GEO | `src/content/**`, `src/app/llms.txt/**`, `public/llms*`, `src/features/**/structured-data*.ts`, `src/features/jobs/job-posting-structured-data.ts`, `docs/lanes/04-geo.md` |
| LANE-TASARIM | `src/components/**`, `src/experience/**`, `src/styles/**`, `src/assets/**`, `tests/e2e/accessibility.spec.ts`, `tests/unit/design-tokens.test.ts`, `tests/unit/design-token-drift.baseline.json`, `docs/lanes/05-tasarim.md` |
| LANE-AUTH | `src/features/identity/**`, `src/app/[locale]/(auth)/**`, `src/app/[locale]/auth/**`, `src/proxy.ts`, `src/server/auth/**`, `supabase/templates/**`, `docs/lanes/06-auth.md` |
| LANE-URUN | `src/features/**`, `!src/features/identity/**`, `!src/features/**/structured-data*.ts`, `!src/features/jobs/job-posting-structured-data.ts`, `src/server/config/**`, `src/server/push/**`, `src/server/email/**`, `src/lib/analytics/**`, `src/lib/pwa/**`, `docs/lanes/07-urun.md` |
| LANE-QA | `tests/**`, `!tests/e2e/accessibility.spec.ts`, `!tests/unit/design-tokens.test.ts`, `!tests/unit/design-token-drift.baseline.json`, `!tests/security/**`, `docs/performance-budget.md`, `docs/lanes/08-qa.md` |
| LANE-GÜVENLİK | `tests/security/**`, `docs/threat-model.md`, `docs/data-retention.md`, `docs/lanes/09-guvenlik.md` |
| LANE-VERIFY | `tests/verify/**`, `scripts/verify-*.mjs`, `docs/verification-log.md`, `docs/lanes/11-verify.md` |
| LANE-İÇERİK | `src/messages/**`, `src/i18n/**`, `src/content/**`, `docs/lanes/12-icerik.md` |
| LANE-TESLİMAT | `scripts/prune-vercel-deployments.mjs`, `scripts/approve-pending-runs.mjs`, `scripts/verify-production-deployment.mjs`, `docs/deploy-log.md`, `docs/lanes/14-teslimat.md` |
| LANE-OPERATÖR | `docs/OPERATOR.md`, `scripts/lane-autopilot*.mjs`, `scripts/lane-kickoff*.mjs`, `scripts/system-health*.mjs`, `scripts/reap-stalled-sandboxes*.mjs`, `docs/lanes/15-operator.md` |
| LANE-INFRA | `.github/**`, `scripts/**`, `src/app/api/build-info/**`, `package.json`, `bun.lock`, `package-lock.json`, `.gitignore`, `.mcp.json`, `AGENTS.md`, `docs/developer-tooling.md`, `docs/lanes/00-orchestration.md`, `docs/lanes/README.md`, `docs/lanes/POLICY.md`, `docs/lanes/AUDIT.md` |

**Her lane kendi brief'ine sahiptir.** Protokol "notlarını `docs/lanes/<ad>.md`'ye
yaz" der; o dosya o lane'in çalışma alanıdır, başkası dokunmaz.

**Dışlama sözdizimi:** bir glob `!` ile başlıyorsa o yol o lane'in **dışındadır**.
Sıra önemlidir: önce dahil edilenler, sonra dışlananlar uygulanır. Yukarıdaki
`LANE-URUN` satırı "tüm `src/features/**`, ama identity ve structured-data
hariç" demektir. Dedektör (`scripts/lane-collisions.mjs`) bu sözdizimini anlar.

**Neden dışlama gerekti:** `src/features/jobs/job-posting-structured-data.ts`
hem URUN'un dizininde hem GEO'nun modülünde; `tests/e2e/accessibility.spec.ts`
hem QA'nın katmanında hem TASARIM'ın guard'ında. Dizin düzeyinde sahiplik bu iki
dosyada örtüşüyordu — dışlama bunu kesin biçimde çözer.

### Lane → skill eşlemesi

Her lane işini yaparken kendi uzmanlık skill'ini kullanır. Skill'ler
`.agents/skills/` altındadır (OpenHands extensions reposundan kuruldu, tarandı).

| Lane | Skill'ler |
|---|---|
| LANE-TASARIM | `frontend-design` (özgün, üretim kalitesinde UI), `code-simplifier` |
| LANE-SEO / LANE-GEO | `evidence-based-citations` (iddiaları resmî kaynakla bağla) |
| LANE-SUPABASE / LANE-AUTH / LANE-GÜVENLİK | `security` (güvenli kodlama, yetkilendirme, veri koruma) |
| LANE-CLOUDFLARE | `security` |
| LANE-URUN | `code-review`, `qa-changes`, `code-simplifier` |
| LANE-QA | `qa-changes` (PR'ı işlevsel doğrula), `code-review` |
| LANE-INFRA | `github-actions` (workflow kur/debug et) |
| Her lane (PR öncesi) | `code-review`, `qa-changes` |
| PR'a yorum yazarken | `github-pr-review` |
| Sadeleştirme turunda | `code-simplifier` |

`code-review` ve `qa-changes` her lane'in **tanım-bitti** kapısının parçasıdır:
PR açmadan önce değişikliği kendi başına gözden geçir, çalıştır, sonucu raporla.

### Çakışma çözümü (ÖNEMLİ)
- **`src/app/[locale]/layout.tsx` ve `jobs/[slug]/page.tsx` içinde hem görsel JSX
  hem JSON-LD var.** Bu dosyaların sahibi **LANE-SEO**'dur. Görsel/JSX
  değişikliği gerekiyorsa TASARIM rapor eder; JSON-LD şekli gerekiyorsa GEO
  **üretici modülü** (`src/features/**/structured-data*.ts`) düzenler, mount'u SEO
  uygular. İki lane aynı route dosyasını asla aynı anda düzenlemez.
- `supabase/templates/**` içerik = **AUTH**; `supabase/config.toml` = **SUPABASE**.
- `llms.txt` mount (`src/app/llms.txt/route.ts`) = **GEO**; sitemap/robots = **SEO**.

## Lane başlatma (her chat'in ilk adımı)

```bash
git fetch origin
git checkout -b lane/<ad> origin/main     # main'den başla, başka lane'in branch'inden DEĞİL
git status -sb                            # kirli dosya varsa dokunma
```

- Bu dokümanı ve `AGENTS.md`'yi **oku**. Notlarını yalnızca kendi
  `docs/lanes/<ad>.md` dosyana yaz (index'e yazarsan 6 lane çakışır).
- PR açmadan önce `git fetch origin && git rebase origin/main`.
- Merge = sahibin kararı; sen PR'ı açık bırak.


## Sıra (dalga dalga)

- **Dalga 0 (bloklamayan, hemen):** LANE-TASARIM, LANE-SEO, LANE-GEO, LANE-AUTH (kod tarafı)
- **Dalga 1:** LANE-SUPABASE (tek DB yazarı; migration + pgTAP)
- **Dalga 2:** LANE-CLOUDFLARE (token yetkileri netleşince)

## Her lane'in rapor formatı

```
Lane: <ad>            Branch: <branch>            PR: <link>
Değişen dosyalar: ...
Çalıştırılan kontroller: lint/typecheck/gate/unit/e2e -> sonuç
Canlıya dokundu mu: hayır / evet (ne yaptı)
Sahibin yapması gerekenler: ...
Sonraki lane için notlar: ...
```

---

## LANE-INFRA — tur notları

> LANE-INFRA'nın brief'i bu dosyadır (`lanes.json` → `brief: "00-orchestration"`);
> ayrı bir `docs/lanes/infra.md` yok. Bu yüzden infra tur notları buraya yazılır.

### Tur — CI kapıları + mikro-denetim (PR #193, 2026-11-05)

**Kapsam.** Atanmış iki `agent:infra` issue'su (#136, #150) alındı; ikisi de
"suite'i script'e ve CI'a bağla" istiyordu. Ayrıca sahip olunan dosyalar
(`.github/**`, `scripts/**`, `package.json`) AUDIT.md boyutlarıyla tarandı.

**Yapılanlar.**

1. `test:integration` script'i + `static` job'da ayrı adım. Katman
   `--experimental-test-module-mocks` ister; bayraksız **3 dosya patlar, 0 geçer**
   (`mock.module is not a function`), bayrakla **43/43**. Kanıtlandı.
2. `test:visual` script'i + `e2e` job'da shard 1'e kısıtlı adım. Mevcut üretim
   standalone build'i ve seed'li Supabase'i yeniden kullanır; sunucu adım içinde
   başlatılıp (sinyal → port bırakma beklemesi) kapatılır ki ardından gelen
   Playwright `webServer` :3000'e bağlanabilsin. Baseline'lar shard'lar arası
   bit-bit aynı olduğu için dört kez koşmak kapsam katmaz.

**Mikro-denetim bulguları (hepsi düzeltildi, hepsi kendi dosyamda).**

| # | Bulgu | Düzeltme |
|---|---|---|
| 1 | `sharp` 7 dosyada doğrudan import ediliyor ama `package.json`'da yok; yalnız `next` optional dep + `@gltf-transform/cli` üzerinden geçişli çözülüyor (phantom dependency) | `devDependencies`'e eklendi |
| 2 | `bun.lock` sahiplik tablosunda yok → `package.json`'ı düzenleyen lane lockfile'ı commit'leyemez, `lane-collisions.mjs` "owned by no lane" der | LANE-INFRA'ya eklendi |
| 3 | `.github/copilot-instructions.md` "Available gates" listesi eksik (`check:frontend-source`, `test:security`, `test:integration`, `test:visual` yok) | Liste gerçek script'lerle hizalandı |
| 4 | İki test katmanı hiçbir CI adımında değil → `tsx --test <glob>` eşleşmezse exit 0, sessiz yeşil | İki adım eklendi |

**Doğrulama (gerçek üretim build'i + seed'li Supabase, yerel).** `lint`,
`typecheck`, `check:frontend-source` temiz; `test:unit` 444/444; `test:security`
35 pass / 3 todo (exit 0); `test:integration` 43/43; `test:visual` **12/12, 0px**.
`test:visual` kırmızı→yeşil: bir baseline silinince çıkış 1 (`FAIL — 1/12`),
geri konunca `PASS — 12/12`. Canlıya dokunulmadı.

**Notlar (sonraki turlar için).**

- Bu PR `.github/workflows/**` değiştirdiği için `agent-pr-automation.yml`
  gereği otomatik merge **edilmez**; insan merge eder.
- Yerel doğrulama için: sandbox'ta `sudo dockerd` + `sudo chmod 666
  /var/run/docker.sock` ile Docker ayağa kalkar, `bun run db:start` seed'li
  stack'i getirir. `next` standalone sunucusu çalışırken süreç adını
  `next-server` yapar — `pkill -f standalone/server.js` onu öldürmez, portu
  `/proc/<pid>/net/tcp` içinde `0BB8` arayarak bulup PID ile öldür.
- **`NEXT_DIST_DIR` ile üretim build'i standalone sunucuyu bozar:** server.js
  `config.distDir`'i kullanır ve static'i `<distDir>/static`'ten bekler, ama
  standalone çıktısı `.next/static`'e kopyalanır → tüm `/_next/static/**` 404
  döner ve `test:visual` 12/12 kırmızı olur. Bu yüzden görsel doğrulama
  **varsayılan `.next`** ile build edilmeli (CI de öyle yapar).

### Tur 2 — görsel kapı runner'da kırmızı: font rasterizasyonu (handoff #210)

**Bulgu.** `test:visual` CI `e2e` job'ında (shard 1) 12/12 shot'ı kırmızı yaktı;
ama **boyutlar birebir aynı**, fark **metin-ağırlıklı** (`jobs-card` %3.2,
`header-el` %2.9, `header-de` %2.7 vs `packages-lead` %0.5, `home-search-fa`
%0.9) ve **deterministik** (iki koşu bit-bit aynı sayaçlar).

**Teşhis.** Aynı kod + aynı Chrome (157.0.8103.38) + CI'ın **tam build env'i**
(`NEXT_PUBLIC_GA_MEASUREMENT_ID`, VAPID, Supabase değişkenleri) ile yerelde
**12/12, 0px** yeşil. Tek değişken: OS — sandbox Debian 13, runner ubuntu-24.04.
Shot'lar `el`/`ru`/`fa` içeriyor; self-hosted display yüzleri her glifi taşımıyor,
OS'in seçtiği fallback aile pikselleri belirliyor. Yani bu bir **regresyon değil,
ortam farkı**.

**Karar.** Baseline'lar (`tests/visual/**`) LANE-QA'nın; bu PR onlara dokunmaz.
Adım **advisory** yapıldı (`continue-on-error`) ama sessiz değil: 12 shot yine
koşar, tablo basılır, kırmızı `::warning` + job summary + yüklenen diff
artefaktlarıyla görünür olur, webfont erişilebilirlik teşhisi eklenir (404 olsa
wiring hatası olurdu). Baseline'ların runner ortamında yeniden üretimi **#210**
(LANE-QA, `agent:handoff`) ile izleniyor; o merge olunca `continue-on-error`
kaldırılıp adım gerçek kapı olur.

**Ders.** Ortama bağlı piksel baseline'ı, üretildiği OS'ten başka bir OS'te
koşunca yanlış pozitif verir. Bir görsel kapıyı CI'a bağlamadan önce baseline'ın
**hangi ortamda** üretildiğini ve runner'ın o ortamla aynı olup olmadığını
doğrula; değilse önce baseline'ı runner'da üret.



### Tur 3 — token israfı denetimi (#218)

**Kapsam.** `agent:infra` etiketli #218 (520M prompt token) alındı; kanıt API
şemasıyla (`https://app.all-hands.dev/openapi.json`) ve kodla doğrulandı. Dört
kök nedenden ikisi platform ayarı (operatör), ikisi repo kodunda (bu lane).

**Bulgular (tablo PR gövdesinde).**

| # | Bulgu | Durum |
|---|---|---|
| 1 | `.lane-state.json` gitignored **ve** `lane-autopilot.yml`'de hiçbir kalıcılık adımı yok → her 30 dk'lık koşuda taze runner'da state sıfırlanıyor, `maxAttemptsPerLane` (sonsuz-retry freni) **hiç ateşlenemiyor** | düzeltildi (cache) |
| 2 | Konuşma yeniden kullanımı tükenince **yeni sandbox** açılıyordu → kota (sandbox yaratma) harcanıyordu; üstelik sayaç sıfırlanmadığı için sonraki her geçişte yeniden | düzeltildi (aynı sandbox'ta taze konuşma + sayaç sıfırlama) |
| 3 | İşi olmayan lane'e yine kickoff gidiyordu ("no work yet") → boşuna tam konuşma yakıyor | düzeltildi (`hasLabelledWork` kapısı, `requireLabelledWork`) |
| 4 | Condenser zaten açık (`llm_summarizing`, `max_size` 240) ama araç onu **yanlış dokümandan** okuduğu için "kapalı/null" sanıyordu; `max_budget_per_task` null | araç düzeltildi (`/api/v1/settings`) + `max_budget_per_task` için `--apply` reçetesi |

**Not:** #2 main'de kısmen vardı (`MAX_REUSES` / `maxReusesPerConversation`, #192
ile geldi) ama tükenince **yeni sandbox**'a düşüyor ve `reuses` sayacını
sıfırlamıyordu — ikisi de kota sızıntısı. Bu tur onu aynı sandbox'ta taze
konuşmaya çevirdi.

**Platform kanıtı (düzeltildi — bkz. Tur 3.1).** `POST /app-conversations` şeması
`max_iterations`/`condenser` **kabul etmiyor** (yalnız `sandbox_id`,
`conversation_id`, `initial_message`, …). Ayarlar **kullanıcı** dokümanında
(`/api/v1/settings`) yaşar: `max_budget_per_task` üst düzeyde, condenser
`agent_settings.condenser` altında. Bu yüzden #4 repo kodundan çözülemez;
`scripts/lane-budget.mjs` (varsayılan salt-okuma, `--apply` ile yazar) ve
`bun run lane:budget` eklendi.

**Mekanizma.** `POST /app-conversations` `sandbox_id` kabul ettiği için aynı
sandbox üzerinde **taze konuşma** açılabiliyor: kota maliyeti yok (sandbox
yaratılmıyor), geçmiş sıfır. Konuşma açma asenkron (POST bir start-task döner),
bu yüzden state **sandbox id + görev sayısı** tutar, dönen id'yi değil.

**Doğrulama.** `scripts/lane-autopilot-core.test.mjs` **12/12** (yeni),
`scripts/lane-collisions.test.mjs` **6/6** (yeni), `test:unit` **828/828**,
`lint`/`typecheck`/`check:frontend-source` temiz, `lane-autopilot.mjs --dry-run`
karar tablosunu hatasız basıyor. Canlıya dokunulmadı (ayar yalnız `--apply`
+ insan onayıyla yazılır).

**Sahibin yapması gereken (operatör).** `OPENHANDS_API_KEY=… bun run lane:budget
-- --apply` ile condenser `max_size` ve `max_budget_per_task` canlıya uygulanır;
bu hesap-geneli olduğu için bilinçli bir karar.

### Tur 3.1 — düzeltme: arıza okuma yolundaydı, yazma değil

**Bulgu.** Tur 3, `scripts/lane-budget.mjs`'in condenser okumasını yanlış
değerlendirdi: "platform `agent_settings_diff`'i sessizce düşürüyor" sanıldı.
Gerçekte **yazma kalıcıydı**, sorun **okumaydı**: eski script condenser'ı
`GET /api/organizations/app`'ten okuyordu, ama o ucun yanıt modeli
(`OrgAppSettingsResponse`) yalnız `{enable_proactive_conversation_starters,
max_budget_per_task, registered_marketplaces, updated_at}` döndürür —
`agent_settings` **yoktur**. Dolayısıyla okuma her zaman `condenser: null`
basıyordu ve bu "platform düşürüyor" diye yorumlandı.

**Kanıt (2026-11-09, canlı).**
- `POST /api/organizations/app` gövdesi `{"agent_settings_diff":{"condenser":
  {"condenser_kind":"llm_summarizing","enabled":true,"max_size":241,…}}}` →
  `GET /api/organizations/<org>/settings` taze okumada `max_size: 241` gösterdi
  (testte 240'a geri alındı). Yani org-geneli varsayılanlara **yazılıyor**;
  "düşürülüyor" değil. `GET /api/organizations/<org>/settings`
  (`OrgDefaultsSettingsResponse`) `agent_settings.condenser`'ı **açıkça** içerir.
- `GET /api/v1/settings` (`GETSettingsModel`) da `agent_settings.condenser`'ı ve
  üst düzey `max_budget_per_task`'ı içerir; `POST /api/v1/settings` ile
  `{"agent_settings_diff":{"condenser":{…,"max_size":241}}}` → `{"message":
  "Settings stored"}` ve taze okuma 241 (240'a geri alındı).
- Alan adı `kind` değil **`condenser_kind`**; yanlış anahtar sessizce yok sayılır.
- **Condenser zaten açıktı:** hem org varsayılanlarında hem kullanıcı dokümanında
  `{condenser_kind: "llm_summarizing", enabled: true, max_size: 240, keep_first: 2,
  minimum_progress: 0.1}`. Yani Tur 3'ün "condenser pratikte kapalı" öncülü de
  yanlıştı — asıl arıza yalnız **okuma yolundaydı**.

**Düzeltme.** `scripts/lane-budget.mjs` artık `/api/v1/settings` kullanır
(kullanıcı dokümanı; condenser'ı doğrudan sunar), doğru
`condenser_kind`/`enabled` alanlarını yazar ve `agent_settings.condenser`'ı okur
(`condenserOf`). Regresyon testi `scripts/lane-budget.test.mjs` endpoint'i ve alan
adlarını kilitler (8/8).

**Not (uç nokta ayrımı).** "Org ucunda `agent_settings` yok" ifadesi yalnızca
`/api/organizations/app` **yanıtı** için doğrudur; org **varsayılanları** ucu
(`/api/organizations/<org>/settings`) `agent_settings.condenser`'ı içerir. İkisini
karıştırmak bu yanlış teşhisin kaynağıydı.

### Tur 3 — ek bulgu: çakışma dedektörü yanlış pozitif üretiyordu

**Bulgu.** `scripts/lane-collisions.mjs` içindeki `laneFromBranch` branch adının
**tüm** sonekini lane adı sanıyordu: `lane/qa-visual-baselines` →
`LANE-QA-VISUAL-BASELINES` (hiçbir lane'e uymaz). Sonuç: bir lane ek iş için
ikinci bir branch açtığında (ör. QA'nın #228'i) o PR'ın **her dosyası** "does not
own it" diye raporlanıyordu — dedektörün tam da engellemek istediği şeyi yanlış
alarmla gölgeliyordu.

**Düzeltme.** `laneFromBranch` artık bilinen lane adlarından **en uzun öneki**
eşliyor (`lane/qa-visual-baselines` → `lane-qa`). `main()` çağrısı
`import.meta.url` ile korundu (test edilebilir), `laneFromBranch` dışa açıldı.
`scripts/lane-collisions.test.mjs` **6/6** (yeni): düz branch, ek sözcüklü
branch, Türkçe ad katlama, önek çakışması (LANE-A vs LANE-AUTH), lane olmayan
branch, bilinmeyen lane.

**Kanıt.** Düzeltme öncesi: 19 yanlış "does not own it" (hepsi #228). Sonrası:
0 yanlış pozitif.

### Tur 3 — görsel adım artık gerçek kapı (advisory kaldırıldı)

**Arka plan.** #193'te `test:visual` adımı, baseline'lar geliştirici sandbox'ında
(Debian 13) üretildiği ve runner (ubuntu-24.04) metni farklı rasterize ettiği
için **advisory** yapılmıştı (`continue-on-error`), çünkü baseline'lar LANE-QA'nın
dosyalarıydı (devir #210).

**Ne oldu.** LANE-QA #228 ile baseline'ları runner render'ına sabitledi
(2026-11-05 20:29'da merge). Rebase sonrası bu branch'te `test:visual` CI'da
**PASS — 12/12 shots match their baselines** verdi.

**Yapılan.** `ci.yml`'de `continue-on-error` kaldırıldı; adım artık **gerçek
kapı**. "Report a visual regression" advisory uyarı adımı silindi; diff
artefaktlarını yükleyen adım `failure()` koşuluna alındı (kapı kırmızı olunca
kanıt kalır).

### Tur — devir kuyruğu (#306, #428, #188, #292, #385, #447, #309, #386)

**Kapsam.** LANE-INFRA'ya devredilen sekiz issue (hepsi sahip olunan yollarda:
`scripts/**`, `.github/**`, `package.json`, bu dosya) sırayla alındı, kanıtı
doğrulandı, düzeltildi, test edildi.

**Yapılanlar.**

1. **#306 — doğrudan-çalıştırma koruması.** Sekiz script'te kırılgan
   `import.meta.url === \`file://${process.argv[1]}\`` yerine
   `pathToFileURL(process.argv[1]).href` karşılaştırması. Yol içinde boşluk/özel
   karakter/Windows sürücü harfi olduğunda eski biçim `main()`'i hiç çalıştırmaz
   (sessiz no-op); yeni biçim yolu doğru yüzde-kodlar. Dört script zaten
   sağlamdı, dokunulmadı.
2. **#428 — lane-collisions CI'a bağlandı.** `static` job'ına `pull-requests:
   read` izni + `node scripts/lane-collisions.mjs` adımı. `gh` okuması
   başarısızsa script artık **yüksek sesle** sıfırdan farklı çıkar (eskiden
   sessizce "çakışma yok" derdi — kapının önlemek istediği tam da bu yanlış
   yeşildi).
3. **#188 — stale `package-lock.json` kaldırıldı.** Paket yöneticisi bun
   (`bun.lock`); `npm ci` `bun.lock`'a karşı zaten başarısız. İkinci, bayat
   manifest Dependabot'un denetlediği tek lockfile'dı. Dosya silindi +
   `.gitignore`'a eklendi; `.github/dependabot.yml` ekosistemi `bun`'a çevrildi.
4. **#292 + #385 — `indexing:verify` + `%DAYS%` kapısı.** `package.json`'a
   `indexing:verify` script'i; `check-frontend-source.mjs`'teki `%DAYS%`
   iddiası hem eski `String(selectedDuration)` hem yerel-duyarlı
   `Intl.NumberFormat(locale).format(...)` biçimini kabul edecek şekilde
   genişletildi (LANE-TASARIM'ın `fa` rakam düzeltmesi kapıya takılmasın).
5. **#447 — ilçe görsel bütçesi.** `check-frontend-source.mjs` ilçe hero
   görsellerini gevşek 9 MB yerine **500 KB** ile denetler. Negatif test: 500 KB
   üstü görselde kapı kırmızı.
6. **#309 — IndexNow anahtarı.** Yeni `scripts/indexnow-key.mjs`
   (`readIndexNowKey`) anahtarı **ad==gövde** eşleşmesiyle seçer; `submit-
   indexnow.mjs` ve `verify-indexing.mjs` bunu kullanır. Eski `entries.find(...)`
   dosya sistemi sırasına güvenip `security.txt`/`ads.txt` gibi eşleşen bir
   `.txt`'i sessizce anahtar sanabiliyordu.
7. **#386 — sahipsiz `src/server/email/**`.** Bu dosyadaki LANE-URUN sahiplik
   satırına eklendi; `lane-collisions.test.mjs`'e bu boşluğun geri açılmasını
   engelleyen ratchet testi.

**Çalıştırılan kontroller.** `bun run lint`, `typecheck`,
`check:frontend-source`, `test:unit` (875 test), `test:security` (163),
`test:integration` — hepsi yeşil. Yeni `indexnow-key.test.mjs` 5/5.

**Canlıya dokundu mu:** hayır. Hiçbir Supabase/Vercel yazımı yok; yalnız kaynak
ve CI yapılandırması.

### Tur — devir kuyruğu, ek: çakışma kapısı kendi PR'ını kırdı (#428)

CI'a bağlanan `lane-collisions.mjs` **Static checks → Lane collisions** adımında
`Found 2 collision problem(s)` verdi. Yerel koşuda görünmemesinin nedeni
oturumdaki token'dı: varsayılan `gh` kimliği (`orijinus1997-sudo`) yalnız
kendi PR'larını listeler, çakışmayı raporlamaz. Depo admin token'ı
(`GITHUB_PERSONAL_ACCESS_TOKEN`) ile çalıştırınca aynı iki satır çıktı:

```
#493 .gitignore — owned by no lane
#493 package-lock.json — owned by no lane
```

**Kök neden.** Dedektör sahipliği `docs/lanes/00-orchestration.md`'den okur;
LANE-INFRA satırı bu iki yolu listelemiyordu. `5d20745` (bayat npm lockfile'ını
kaldır, `.gitignore`'a ekle) ikisine de dokununca dedektör kendi PR'ını çakışma
saydı — `bun.lock` için daha önce düzeltilen (mikro-denetim #2) hatanın aynısı,
iki yol daha eksik kalmış.

**Düzeltme.** `package-lock.json` ve `.gitignore` LANE-INFRA sahiplik satırına
eklendi; `lane-collisions.test.mjs` bu üç yolu (bun.lock, package-lock.json,
.gitignore) LANE-INFRA'ya sabitledi.

**Ders.** Çakışma kapısını yerelde "yeşil" görüp geçmeyin: `gh pr list` çağıran
her kontrol, token'ın görebildiği PR kümesine bağlıdır. Kapıyı gerçek kümeyle
denemek için admin token'la çalıştırın. Doğrulandı:
`No collisions across 1 open PR(s).` (önce 2), `lane-collisions` 9/9, tam CI
(Static + Database + 4×E2E) yeşil.

### Tur — devir kuyruğu, ek 2: LANE-OPERATÖR harness ailesi sahipsizdi (#428)

Kapı düzeltildikten sonra PR #494 (`lane/operator`, #443) açıldı ve çakışma
yeniden kırmızıya döndü:

```
#494 scripts/lane-autopilot-core.mjs — lane-operator does not own it (LANE-INFRA)
#494 scripts/lane-autopilot-core.test.mjs — lane-operator does not own it (LANE-INFRA)
```

**Kök neden.** Sahiplik tablosu LANE-OPERATÖR için yalnız
`lane-autopilot.mjs`, `lane-kickoff.mjs`, `system-health.mjs` listeliyordu.
Operatör lane'i harness'ini sonradan modülleştirdi ve `reap-stalled-sandboxes`
ekledi (`lane-autopilot-core.mjs`, `lane-kickoff.test.mjs`,
`system-health-core.mjs`, `system-health.test.mjs`,
`reap-stalled-sandboxes.mjs` + test — hepsi `operator(tur)` commit'lerinden),
ama tabloya yazılmadı. Hepsi LANE-INFRA'nın `scripts/**` catch-all'ına düştü →
operatör kendi dosyasını düzenleyince "sahibi değil" denildi.

**Düzeltme.** LANE-OPERATÖR satırı aile globlarına genişletildi:
`scripts/lane-autopilot*.mjs`, `scripts/lane-kickoff*.mjs`,
`scripts/system-health*.mjs`, `scripts/reap-stalled-sandboxes*.mjs`.
`lane-collisions.test.mjs` on dosyalık aileyi LANE-OPERATÖR'e sabitledi.

**Ders.** `scripts/**` gibi bir catch-all satır, başka bir lane yeni bir script
yarattığı an yanlış sahiplik üretir. Bir lane kendi alanında dosya çoğaltınca
sahiplik satırını da güncellemeli; catch-all'ı dar tutmak yerine lane satırını
glob'la büyütmek doğru yön. Doğrulandı: `No collisions across 2 open PR(s).`,
`lane-collisions` 10/10, `test:unit` 876/874 pass.

### Tur — sahipsiz güvenlik yüzeyleri (#435)

#435'un bildirdiği iki sahipsiz yüzey doğrulandı ve sahiplendirildi. Tabloda
`src/proxy.ts`, `src/server/auth/**` ve `src/app/api/build-info/**` için **hiç**
satır yoktu; üçü de `lane-collisions.mjs`'in "owned by no lane" sınıfına
düşüyordu.

**Kanıt.** `grep -n "proxy.ts\|build-info" docs/lanes/00-orchestration.md` →
eşleşme yok. Dosyalar var (`src/proxy.ts` 3876 B, `src/app/api/build-info/route.ts`).
`src/proxy.ts` oturum çerezi + locale yönlendirmesinin güvenlik sınırı;
`src/server/auth/supabase-guards.ts` onun auth koruması; `build-info/route.ts`
`force-static` yapı kimliği yüzeyi (M-01).

**Düzeltme.** LANE-AUTH satırına `src/proxy.ts` + `src/server/auth/**`
(oturum sınırı auth lane'inindir), LANE-INFRA satırına
`src/app/api/build-info/**` eklendi. `lane-collisions.test.mjs` üç yolu
sabitledi (11/11).

**Ders.** `src/**` ağacının tabloda kapsanmayan kök dosyaları (`src/proxy.ts`
gibi, `src/` altında ama hiçbir lane glob'una girmeyen) sessizce sahipsiz kalır.
Yeni bir üst-düzey kaynak dosyası eklerken sahiplik satırını da güncelle.

### Tur — Copilot-only workspace config sahiplendirildi (#475)

**Kapsam.** `#475` iki kaynağın OpenHands tarafından **okunmadığını** kanıtlıyor:
`.github/skills/` (yalnız `.agents/skills/` proje skill'i olarak yüklenir) ve
`.mcp.json` (OpenHands'ta proje-seviyesi MCP dosyası yok). İkisi de sahiplik
tablosunda ya hiç geçmiyordu ya da `.github/**` ile dolaylı eşleşiyordu.

**Bulgu (doğruluk + mantık).** `docs/developer-tooling.md` ikisini de OpenHands
"proje skill'i"/"proje MCP'si" gibi sunuyordu; `scripts/lane-collisions.mjs`
`.mcp.json` ve `docs/developer-tooling.md` için "owned by no lane" diyordu
(`.github/skills/**` yalnız `.github/**` sayesinde eşleşiyordu).

**Düzeltme.** `docs/developer-tooling.md` düzeltildi (her iki kaynağın yalnız VS
Code Copilot için olduğu açıkça yazıldı). LANE-INFRA sahiplik satırına `.mcp.json`
+ `docs/developer-tooling.md` eklendi. `lane-collisions.test.mjs` üç yolu
sabitledi (12/12). **Taşıma kararı (T2):** dört iş akışı `.agents/skills/`'e
**taşınmaz** — lane brief'leri proje-özgü yordamsal bilgiyi zaten taşır; ikinci
kopya sapma yüzeyi olurdu. Karar `docs/developer-tooling.md`'de kayıtlı.

**Kuyruk durumu.** `#306` (bozuk doğrudan-çalıştırma koruması), `#428`
(`lane-collisions` CI'a bağlı), `#188` (`package-lock.json` düşürüldü),
`#292` (`indexing:verify`), `#385` (`%DAYS%` kapısı), `#447` (ilçe görselleri
500 KB bütçesi), `#309` (`indexnow-key.mjs` ad==gövde), `#386`
(`src/server/email/**` → LANE-URUN) — **hepsi bu dalda daha önce düzeltilmiş
commit'lerle mevcut** (sırasıyla `6c2dd0c`, `4de5349`, `cc7a9dc`, …); doğrulandı.
Bu turda kalan tek açık kalem `#475`'ti.

### Tur — devir kuyruğu kapatıldı + AGENTS.md sahiplendirildi (#437)

**Kapsam.** Bu turda önce kendi dalımın **iş çakışması** giderildi, sonra
kuyruktaki kalan açık kalem `#437` düzeltildi.

**Bulgu 1 (iş çakışması / mantık).** LANE-INFRA dalı `scripts/verify-auth-config.mjs`,
`verify-deliverability.mjs`, `verify-indexing.mjs` dosyalarına dokunmuştu. Bu yollar
sahiplik tablosunda **LANE-VERIFY**'in (satır 35) ve PR #541 aynı düzeltmeyi zaten
taşıyordu → `lane-collisions` üç örtüşme buldu, `Static checks` kırmızıydı.

**Düzeltme 1.** Üç dosya `main`'e geri alındı. `indexnow-key.mjs` ad==gövde
düzeltmesi ve testi (hiçbir PR'ın dokunmadığı yollar) kaldı. Kapı artık temiz:
`No collisions across 2 open PR(s)`.

**Bulgu 2 (doğruluk).** `AGENTS.md` şöyle diyordu: varsayılan dil (`tr`) "sunulan
URL'de ön-ekli". Yanlış: `src/proxy.ts:18-22` her `/tr/...` yolunu **308** ile
ön-eksiz biçimine yönlendiriyor, yani `tr`'nin **tek** genel URL'i var ve kanonik/
`x-default` ile aynı. (Canlı `robots.txt` de `/tr/auth/` listelemiyor — çünkü
`/tr/*` önce kırpılıyor.)

**Düzeltme 2.** `AGENTS.md` doğru davranışı yazacak biçimde düzeltildi. Ayrıca
`AGENTS.md` sahiplik tablosunda **hiçbir lane'de yoktu**; bu yüzden onu düzenleyen
her PR `lane-collisions`'ta "owned by no lane" olurdu. LANE-INFRA satırına
`AGENTS.md` eklendi; `lane-collisions.test.mjs` bir ratchet testiyle sabitledi
(13/13). Mutasyon testi: satırdan çıkarılınca test kırmızı, geri konunca yeşil.

**Kuyruk durumu.** `#306`, `#428`, `#188`, `#292`, `#385`, `#447`, `#309`, `#386`
bu dalda daha önce düzeltilmiş commit'lerle mevcut (doğrulandı). `#102` →
`src/server/email/**` LANE-URUN'un; orada `agent:handoff` zaten var. `#442`
(lanes.json modeli) ve `#426` (operator brief) main'de düzeltilmiş.
