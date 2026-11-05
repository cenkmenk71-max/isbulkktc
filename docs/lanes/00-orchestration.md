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
| LANE-SEO | `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/[locale]/**`, `docs/lanes/03-seo.md` |
| LANE-GEO | `src/content/**`, `src/app/llms.txt/**`, `public/llms*`, `src/features/**/structured-data*.ts`, `src/features/jobs/job-posting-structured-data.ts`, `docs/lanes/04-geo.md` |
| LANE-TASARIM | `src/components/**`, `src/experience/**`, `src/styles/**`, `src/assets/**`, `tests/e2e/accessibility.spec.ts`, `tests/unit/design-tokens.test.ts`, `tests/unit/design-token-drift.baseline.json`, `docs/lanes/05-tasarim.md` |
| LANE-AUTH | `src/features/identity/**`, `src/app/[locale]/(auth)/**`, `supabase/templates/**`, `docs/lanes/06-auth.md` |
| LANE-URUN | `src/features/**`, `!src/features/identity/**`, `!src/features/**/structured-data*.ts`, `!src/features/jobs/job-posting-structured-data.ts`, `src/server/config/**`, `src/server/push/**`, `src/lib/analytics/**`, `src/lib/pwa/**`, `docs/lanes/07-urun.md` |
| LANE-QA | `tests/**`, `!tests/e2e/accessibility.spec.ts`, `!tests/unit/design-tokens.test.ts`, `!tests/unit/design-token-drift.baseline.json`, `!tests/security/**`, `docs/performance-budget.md`, `docs/lanes/08-qa.md` |
| LANE-GÜVENLİK | `tests/security/**`, `docs/threat-model.md`, `docs/data-retention.md`, `docs/lanes/09-guvenlik.md` |
| LANE-VERIFY | `tests/verify/**`, `scripts/verify-*.mjs`, `docs/verification-log.md`, `docs/lanes/11-verify.md` |
| LANE-İÇERİK | `src/messages/**`, `src/i18n/**`, `src/content/**`, `docs/lanes/12-icerik.md` |
| LANE-TESLİMAT | `scripts/prune-vercel-deployments.mjs`, `scripts/approve-pending-runs.mjs`, `scripts/verify-production-deployment.mjs`, `docs/deploy-log.md`, `docs/lanes/14-teslimat.md` |
| LANE-INFRA | `.github/**`, `scripts/**`, `package.json`, `bun.lock`, `docs/lanes/00-orchestration.md`, `docs/lanes/README.md`, `docs/lanes/POLICY.md`, `docs/lanes/AUDIT.md` |

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
| 4 | Condenser pratikte kapalı (`max_size` 1e18) + `max_budget_per_task` null | operatör script'i + doküman (org-geneli, canlıya yazılmadı) |

**Not:** #2 main'de kısmen vardı (`MAX_REUSES` / `maxReusesPerConversation`, #192
ile geldi) ama tükenince **yeni sandbox**'a düşüyor ve `reuses` sayacını
sıfırlamıyordu — ikisi de kota sızıntısı. Bu tur onu aynı sandbox'ta taze
konuşmaya çevirdi.

**Platform kanıtı.** `GET /api/organizations/app` → `max_budget_per_task: null`,
condenser ayarı yok. `POST /app-conversations` şeması `max_iterations`/`condenser`
**kabul etmiyor** (yalnız `sandbox_id`, `conversation_id`, `initial_message`, …).
Tek kol: `POST /api/organizations/app` (`OrgAppSettingsUpdate` →
`max_budget_per_task`, `agent_settings_diff`). Bu yüzden #4 repo kodundan
çözülemez; `scripts/lane-budget.mjs` (varsayılan salt-okuma, `--apply` ile yazar)
ve `bun run lane:budget` eklendi.

**Mekanizma.** `POST /app-conversations` `sandbox_id` kabul ettiği için aynı
sandbox üzerinde **taze konuşma** açılabiliyor: kota maliyeti yok (sandbox
yaratılmıyor), geçmiş sıfır. Konuşma açma asenkron (POST bir start-task döner),
bu yüzden state **sandbox id + görev sayısı** tutar, dönen id'yi değil.

**Doğrulama.** `scripts/lane-autopilot-core.test.mjs` **12/12** (yeni),
`scripts/lane-collisions.test.mjs` **6/6** (yeni), `test:unit` **462/462**,
`lint`/`typecheck`/`check:frontend-source` temiz, `lane-autopilot.mjs --dry-run`
karar tablosunu hatasız basıyor. Canlıya dokunulmadı (org ayarı yalnız `--apply`
+ insan onayıyla yazılır).

**Sahibin yapması gereken (operatör).** `OPENHANDS_API_KEY=… bun run lane:budget
-- --apply` ile condenser `max_size` ve `max_budget_per_task` canlıya uygulanır;
bu org-geneli olduğu için bilinçli bir karar.

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
