# Operatör lane'i — sistem bekçisi

Bu lane **alan işi yapmaz**. Sistemin çalışır kalmasını sağlar: kotalar, tıkanıklıklar,
token israfı, döngüler, ölü kaynaklar. Alan işi (auth, SEO, CV, tasarım…) uzman
lane'lere **emir** olarak verilir.

## Rol ayrımı

| Operatör (bu lane) | Uzman lane |
|---|---|
| Kota/tıkanıklık/israf tespiti ve giderme | Alanının kodunu yazmak |
| Merge kuyruğu, deploy sağlığı | PR'ı hazırlamak |
| Lane'lerin çalıştığını doğrulamak | Görevi bitirmek |
| Sorunu **kanıtla** issue açmak | Issue'yu çözmek |
| Harness (kickoff, autopilot, health) | Uygulama kodu |

## Her turda çalıştır (sırayla)

```bash
# 1. Sistem sağlığı — tıkanıklık var mı?
node scripts/system-health.mjs

# 2. Ölü sandbox / kota
curl -s -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "https://app.all-hands.dev/api/v1/sandboxes/search?limit=100" | \
  python3 -c "import sys,json;d=json.load(sys.stdin);i=d.get('items',[]);print('toplam',len(i),'RUNNING',len([x for x in i if x.get('status')=='RUNNING']))"

# 3. Lane'ler çalışıyor mu, hangi işte?
node scripts/lane-autopilot.mjs --dry-run

# 4. Bir tur ilerlet
node scripts/lane-autopilot.mjs
```

## Kota envanteri — hangisi dolar, nasıl açılır

| Servis | Limit | Dolunca belirti | Çözüm |
|---|---|---|---|
| **GitHub Actions** | **sınırsız** (public repo) | — | 🟢 yok |
| **Docker Hub** | 100 çekme/6 saat (anonim) | `toomanyrequests: Rate exceeded` | `DOCKER_USERNAME`+`DOCKER_PASSWORD` secret (ekli) |
| **Vercel** | 100 deploy/gün | `Deployment rate limited` | `scripts/prune-vercel-deployments.mjs` |
| **Resend** | 100/gün, 3000/ay | API 429 | hacim azalt |
| **Supabase e-posta** | 30/saat | GoTrue 429 | test sayısını sınırla |
| **OpenHands sandbox** | 20 oluşturma/gün | `Daily sandbox limit of 20 reached` | `pruneSandboxes` (autopilot'ta) |

**Ders:** dış kota hataları **kod hatası gibi görünür**. Önce servis mesajını oku
(`Rate exceeded`, `rate limited`), kod aramaya başlama.

## Tıkanıklık aileleri (hepsi "iş sürüyor sanılan ama olmayan")

| # | Görünen | Gerçek | Düzeltme |
|---|---|---|---|
| 1 | lane bloklu | `agent:blocked` iki anlamlıydı | `agent:handoff` ayrıldı |
| 2 | dal iş sürüyor | squash-merge edilmiş dal "1 önde" görünür | `working` veya açık PR şartı |
| 3 | sandbox hazır | `resume` sonrası `STARTING` | `waitForSandboxReady` |
| 4 | lane boşta | `send-message` ile meşgul ama start-task `READY` | `execution_status=running` sayılır |
| 5 | sistem kırmızı | **gösterge kendi hatasını okuyor** (kendine referans) | kendi workflow'unu hariç tut |
| 6 | lane ölü | sayaç başarıda sıfırlanmıyor, iş başına değil lane ömrüne bağlı | iş imzası (`work`) + başarıda sıfırla |
| 7 | main CI kırmızı | 0 job'lu **geçici GitHub glitch koşusu** gerçek arıza sanılıyor | job sayısına bak: 0 = glitch (warn), >0 = gerçek (fail) |
| 8 | PR'lar "hareket ediyor" | kuyruk-global kapı (`lane-collisions`) kırmızı → **hiçbiri merge olamaz**; `system-health` yalnız "açık ve yaşlı değil" diye okur | kırmızı adımı yerelde koştur, adı geçen PR'ı bul, sahibine devret |

**Yeni bir tıkanıklık görürsen:** aynı sınıfta mı diye sor — "bir sinyal yanlış
okunuyor mu?" Genelde cevap evet.

**Kuyruk-global kapı uyarısı.** `lane-collisions.mjs` gibi kapılar **tüm açık
PR'ları** okur; bir PR'ın yerel eksiği tüm kuyruğu `BLOCKED` yapar. Böyle bir
kırmızıyı **kendi PR'ına mal etme**: adımı yerelde çalıştır, çıktı hangi PR'ı
adlandırıyorsa sahibine devret. `system-health` bunu "PR'lar hareket ediyor"
diye yeşil gösterebilir (yalnız yaş bakar) — bu yüzden kırmızı adımı elle koştur.

## API reçeteleri (kanıtlanmış)

```bash
# Model yükselt (ORG seviyesi — user seviyesi SESSİZCE yok sayılır)
ORG=$(curl -s -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  https://app.all-hands.dev/api/keys/current | python3 -c "import sys,json;print(json.load(sys.stdin)['org_id'])")
curl -s -X PATCH -H "Authorization: Bearer $OPENHANDS_API_KEY" -H "Content-Type: application/json" \
  "https://app.all-hands.dev/api/organizations/$ORG/settings" \
  -d '{"agent_settings_diff":{"llm":{"model":"openhands/deepseek-v4-pro"}}}'

# Supabase auth config oku/yaz
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/uwmhquvzbilbfzdrlxmb/config/auth"
# PATCH ile şablon yükle; ~60 sn yayılma gerekir

# Bekleyen (onay gerektiren) workflow run'ları onayla
node scripts/approve-pending-runs.mjs

# Lane'leri başlat / iş dağıt
node scripts/lane-autopilot.mjs
```

## Tuzaklar (pahalıya öğrenildi)

1. **Sandbox sıfırlanır** → `bun`, git `insteadOf`, `~/.openhands/memory` kaybolur.
   Her turda: `bash scripts/bootstrap-bun.sh` + `git config --global url."https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/".insteadOf "https://github.com/"`.
2. **Ayarlar API'si `_diff` ister.** `{"agent_settings":…}` sessizce yok sayılır;
   `{"agent_settings_diff":…}` çalışır. `{"message":"Settings stored"}` **uygulandı demek değil** — doğrula.
3. **Yayılma gecikmesi ~60 sn.** Hemen test etme, yanıltıcı sonuç alırsın.
4. **`gh --jq` JS template literal içinde** `"\\(.id)"` gerekir, yoksa filtre literal yazar.
5. **Merge kapısı:** yalnız `mergeable === 'CONFLICTING'` merge'i durdurur.
   `mergeStateStatus: UNSTABLE` (zorunlu olmayan kontrol fail, örn. Vercel) **engellemez**.
6. **Public repo = sınırsız Actions dakikası.** "Habire CI çalıştırma" korkusu yersiz;
   asıl maliyet Vercel + Docker Hub'da.

## Yapılmayacaklar

- **Bot trafiği / sahte tıklama** — Google ceza verir, sıralama düşer.
- **CSP gevşetmek** (üçüncü taraf sohbet/script) — sahibe sormadan yapma.
- **Secret'ı repoya commit etmek** — secret olarak ekle, asla dosyaya yazma.
- **Doğrulanmamış iddia** — "düzeltildi" demek için kanıt şart.

## Devir (bu lane'i kopyalamak)

Bu dosya + `scripts/system-health.mjs` + `scripts/lane-autopilot.mjs` +
`docs/lanes/*` = operatörün tamamı. Yeni bir operatör lane'i başlatmak için:
brief olarak bu dosyayı ver; repodaki araçlar ve brief'ler kalıcıdır, sandbox
hafızası değildir. **Bilgi repoda yaşar, konuşmada değil.**

## Tur notları — mikro-denetim (2026-11-06)

Sahip olunan beş dosya (`docs/OPERATOR.md`, `docs/lanes/15-operator.md`,
`scripts/system-health.mjs`, `scripts/lane-autopilot.mjs`,
`scripts/lane-kickoff.mjs`) AUDIT.md boyutlarıyla tarandı. Bulgular:

| # | Dosya:satır | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|
| 1 | `scripts/system-health.mjs:108` | Yalnız `isbulkktc CI` adlı workflow'u `--branch main` ile sorguluyordu; #375 o workflow'un `push` tetikleyicisini kaldırdığı için sorgu **eski** koşuyu döndürüyor ve "yeşil" diyordu | Varsayılan dalda koşan **her** workflow'un en yeni koşusunu oku | `main`'de kırmızı olan `Verify production deployment` görünmezdi; harness "sağlıklı" derken kapı kırıktı (aynı "gösterge yalan söylüyor" sınıfı) | düzeltildi |
| 2 | `scripts/lane-autopilot.mjs:638-654` | "held runs" onay bloğu **birebir iki kez**; `node scripts/approve-pending-runs.mjs` her pass'te iki kez çalışıyordu (#354) | Tek çağrı | `gh` API trafiği 2×; biri düzenlenip diğeri unutulursa sessiz sapma | düzeltildi |
| 3 | `scripts/lane-autopilot.mjs:129` | `gh pr list` çağrısı `mergeable` alanını istemiyordu; `pr.mergeable` daima `undefined` idi, satır 234'teki çakışma koruması **ölü koddu** | `mergeable` iste; `CONFLICTING` PR'ı auto-merge'e gönderme | Çakışan PR sessizce auto-merge'e girip `BLOCKED` kalabilirdi; #304'ün "görünmez kapı" sınıfı | düzeltildi |
| 4 | `scripts/lane-kickoff.mjs` | Prompt lane'e PR açmadan önce rebase etmesini söylemiyordu (#304) | `git fetch origin main && git rebase origin/main`; çakışırsa dur | Çakışan (CONFLICTING) PR'a GitHub **hiç** CI koşusu açmaz; PR doğrulanmamış kalır | düzeltildi |
| 4b | `scripts/lane-kickoff.mjs:52` | Prompt işi **geniş** etiketle arattırıyordu (`--label ${lane.label}`, ör. `agent:test`) | Dar etiketi kullan (`lane:guvenlik`); `hasLabelledWork` zaten önce dar eşleşiyor | `qa`/`guvenlik`/`verify` üçü de `agent:test` taşır → tek sorgu aynı issue'yu birkaç lane'e verir, iş kopyalanır | düzeltildi |
| 5 | `scripts/lane-autopilot.mjs:174` | Yorum `lane:qa`'nın `infra` ile `agent:test` paylaştığını söylüyordu | `infra`'nın etiketi `agent:infra`; `agent:test`'i paylaşan `guvenlik` | Yanıltıcı yorum → yanlış teşhis | düzeltildi |
| 6 | `docs/OPERATOR.md` ↔ `docs/lanes/15-operator.md` | İki dosya bayt-bayt aynı (aynı işi yapan iki yer) | Tek kanonik brief | Biri güncellenip diğeri unutulursa sapma (AUDIT "tutarlılık" boyutu) | birleştirildi |
| 7 | `scripts/lanes.json` (`brief: "OPERATOR"`) | Kickoff `docs/lanes/OPERATOR.md` okutuyor; dosya **yok** | `brief: "15-operator"` | Operatör lane'i var olmayan dosyayı okumaya çalışır | devir → LANE-INFRA |
| 8 | `.github/workflows/verify-production-deployment.yml` | `main` ilerlerken koşu `--tip`'i başta bir kez okuyor; koşu sürerken yeni commit gelince `expected` eskiyor ve kırmızı düşüyor | `--tip`'i yeniden oku ya da superseded say | `main`'de kırmızı kapı gürültüsü (3/5 koşu) | devir → LANE-TESLİMAT |

**Doğrulama.** `scripts/system-health.test.mjs` **7/7** (yeni),
`scripts/lane-kickoff.test.mjs` **9/9**, `test:unit` **737 geçti / 0 kaldı**,
`lint`/`typecheck`/`check:frontend-source` temiz. Mutasyon kanıtı: eski sorgu
(`--workflow "isbulkktc CI"`) "yeşil" derken yeni sorgu (dal) `Verify production
deployment`'ı kırmızı buldu.

**Bakılmayan dosya yok.** Sahip olunan beş dosyanın tamamı okundu.

## Eşzamanlı PR sınırı (sahibin devrettiği görev)

**Sorun (ölçüldü):** 5 açık PR × 6 job = 30 eşzamanlı CI job → runner kuyruğu.
Bir E2E shard'ı **17 dakika** sürdü. Bekleme, PR sayısıyla doğru orantılı artıyor.

**Görev:** autopilot'a `maxOpenPRs` sınırı ekle. Sınır dolduğunda yeni lane
başlatma, mevcut PR'lar merge olana kadar bekle. `lanes.json`'a koy (tek kaynak).

**Kanıt istenen:** sınır öncesi/sonrası ortalama CI bekleme süresi.

**Neden operatörün işi:** bu bir alan işi değil, **sistem verimi** işi. Lane'ler
kendi PR'larını üretir; kaç tanesinin aynı anda açık kalacağı sistem kararıdır.

## Tur notları — kendine referans ve ölü sayaç (2026-11-08)

İki tıkanıklık, **aynı kök sınıf**: bir sinyal yanlış okunuyor. İkisi de
operatörün kendi aracında, o yüzden devredilmedi, burada düzeltildi.

| # | Dosya | Gözlenen | Gerçek | Etki | Durum |
|---|---|---|---|---|---|
| F1 | `scripts/system-health.mjs` | "main CI" kapısı **kendi** workflow'unu (`System health`) da tarıyordu | Sağlık koşusu kırmızıysa rapor "main CI kırmızı" diyor; bu da yeni bir kırmızı sağlık koşusu üretiyor | Kendine referanslı kilit: gerçek kırmızı kapıyı sonsuza dek maskeler | düzeltildi |
| F2 | `scripts/lane-autopilot.mjs` (#471) | `attempts` sayacı yalnız artıyor, **başarıda sıfırlanmıyordu** | Sayaç iş başına değil **lane ömrüne** bağlıydı | Başarılı bir teslimattan sonra da lane kalıcı `exhausted` kalıyor; yeni iş alsa bile başlamıyor | düzeltildi |

**F1 düzeltmesi.** `system-health-core.mjs`'e `redWorkflowsOnMain(runs)` eklendi:
`failingWorkflows(runs)`'tan `HEALTH_WORKFLOW` (`System health`) çıkarılır.
`system-health.mjs` artık bunu kullanır. Sağlık koşusunun kendi sonucu artık
"main CI" kararına girmez.

**F2 düzeltmesi.** `lane-autopilot-core.mjs`'e `carriedAttempts(entry, work)`
eklendi: `laneDelivered(entry.lastStatus)` ise **0**, `entry.work !== work` ise
**0**, aksi halde `entry.attempts ?? 0`. `decide()` bunu kullanır; iş imzası
(`workSignature`) `entry.work` olarak dört yazma yolunda da kalıcılaştırılır
(REUSED, REFRESHED, RESUMED, kapasite-hatası). Böylece teslim edilen iş sayacı
sıfırlar ve **yeni iş bütçeyi yeniden başlatır** — lane artık ölü kalmaz.
> **Düzeltme (2026-11-09):** `laneDelivered` artık `REFRESHED`'i **saymaz**
> (taze transcript bir *teslimat* değil, bir *yeniden başlatma*'dır). Ayrıca
> saklanan `attempts` artık `carriedAttempts` ile senkronlanır. Aşağıdaki tura bak.

**Kanıt.** `scripts/system-health.test.mjs` + `scripts/lane-autopilot-core.test.mjs`
yeni testlerle **30/30 geçti**. Mutasyon kanıtı: eski davranışa döndürüldüğünde
**4 test kırmızı**, geri alındığında yeşil. Tam `test:unit` **758 geçti / 0 kaldı**;
`lint`, `typecheck`, `check:frontend-source` temiz. Canlı doğrulama: `system-health`
artık `OK main CI` diyor, çıkış kodu 1 → 0.

**Ders.** İki arıza da "gösterge kendi hatasını okuyor" sınıfındandır: (a) bekçi
kendi kırmızısını sistem kırmızısı sanıyor, (b) sayaç başarıyı görmüyor. Yeni bir
tıkanıklık görürsen önce şunu sor: **bu sinyal kimi ölçüyor, kendini mi?**

## Tur notları — araç yükleme denetimi (2026-11-08, kanıtlı)

Bu turda kod değişmedi; **kanıt toplandı**. Amaç: lane'lerin skill / AGENTS.md /
MCP yapılandırmasının gerçekten yüklenip yüklenmediğini doğrulamak. Üç bulgu, üçü
de birincil kaynakla (OpenHands resmî dokümanı + canlı olay günlüğü) doğrulandı.

**Yöntem.** Kanıt bu konuşmanın olay günlüğünden (`$OH_CONVERSATIONS_PATH/*/events/`)
alındı: `event-00000` içindeki `agent_context` ve `event-00001`'deki sistem promptu.
Çapraz kontrol: repo dosyaları + OpenHands dokümanı (skills, repository, mcp-settings).

| # | İddia | Gerçek (kanıt) | Etki | Sahip |
|---|---|---|---|---|
| T1 | `.github/skills/` proje skill'leridir | OpenHands **yalnız `.agents/skills/`** okur (doküman: "Project skills: `<project>/.agents/skills/`"). Canlı: `.github/skills/*` adları (deep-audit, next16-app-router, v4-database-workflow, project-e2e) **hiçbir** yükleme yolunda yok — `lanes.json`'da da geçmez | 4 iş akışı **ölü kaynak**; Copilot içindir, lane'ler görmez | LANE-INFRA |
| T2 | `.mcp.json` proje MCP'si sağlar | Doküman: "There is no per-project MCP configuration file." MCP app-seviyesi (`settings.json`); canlı `mcp_config` boş. `.mcp.json`'u yalnız VS Code Copilot okur | Context7 MCP lane'lerde **etkisiz**; `developer-tooling.md` abartılı anlatıyor | LANE-INFRA |
| T3 | Bu oturumda skill/AGENTS yüklenmedi | `load_project_skills=false`, `load_user_skills=false`, `load_public_skills=false`; `AGENTS.md` sistem promptunda **yok** | **Bu** sohbet repoyu sohbet ortasında klonladığı için (repo işaretleri ilk kez event-00001'de) proje context'i bağlanmadı | — (beklenen) |

**Önemli ayrım (T3).** Lane'ler bu durumda **değil**: `spawn-lanes.mjs` (satır
45/47) ve `lane-autopilot.mjs` (satır 346/348) konuşmayı `selected_repository` +
`git_provider` ile başlatıyor. Yani lane'lerde repo baştan bağlı →
`load_project_skills` açık, `.agents/skills/` + `AGENTS.md` yüklenir. Buradaki
bayrakların kapalı olması **beklenen** davranış, arıza değil.

**T2 operasyonel uyarı.** `.mcp.json` kaldırılsa **hiçbir OpenHands lane'i
etkilenmez**; sadece VS Code Copilot'un Context7 erişimi kaybolur.
`docs/developer-tooling.md` bu dosyayı "proje MCP'si" gibi anlatıyor — düzeltilmeli.

**Devir.** T1 + T2'nin doküman/kod düzeltmesi LANE-INFRA'ya issue olarak açıldı
(`agent:handoff`, `lane:infra`). Bu lane alan işi yapmaz.

**Kanıt komutu.** `python3` ile `event-00000` `agent_context` bayrakları ve
`event-00001` sistem promptu okunur; `grep -rln '.agents/skills' docs/` **boş**
döner — hiçbir doküman lane'lere doğru skill dizinini işaret etmiyor.

## Tur notları — sandbox kilitlenmesi (2026-11-08, kanıtlı)

**Arıza (issue #218).** Sandbox bütçesi 10. Autopilot bir sandbox'ı `RUNNING`
gördükçe dolu sayıyor ve lane'i `busy` kabul ediyor. Konuşma **temiz** biterse
platform sandbox'ı kendisi bırakır; ama `error` ile biten (ya da `finished`/
`stuck` içinde terk edilen) konuşma sandbox'ı `RUNNING` bırakır. O sandbox bir
slotu **sonsuza kadar** tutar; slotlar dolunca autopilot gerçek işi olan lane'leri
`deferred` yapar. Sonuç: sistem sessizce durur, kota yanar.

**Canlı kanıt.** Tur başında `sandboxes/search`: **10 RUNNING** (bütçe tam dolu),
biri ajanın kendi oturumu — yani lane bütçesine yanlış yazılıyor. LANE-geo'da bir
konuşma `exec_status=error`, sandbox hâlâ `RUNNING`, ölü ~17 dk.

**Çözüm — `scripts/reap-stalled-sandboxes.mjs`.** Yalnız **terminal** durumdaki
(`error`/`finished`/`stuck`) lane konuşmalarının sandbox'ını **pause** eder.
Pause slotu serbest bırakır ama worktree'yi korur → autopilot sonra `resume`
edebilir, kota harcamaz. **Silmez.** Güvenlik sınırı: sandbox'a bağlı **herhangi
bir** konuşma aktifse (`running`/`idle`/`paused`/`waiting_for_confirmation`)
dokunulmaz — çalışan bir ajanın altından sandbox çekilmez. `idle` kasıtlı olarak
terminal **değildir**: autopilot'un yeniden kullanım hedefidir.

**Uygulama.** `--apply` ile çalıştırıldı: LANE-geo sızıntısı pause edildi,
RUNNING **10 → 9**, bir slot açıldı.

**Neden ayrı workflow değil (kapı dersi).** İlk denemede ayrı bir
`.github/workflows/reap-stalled-sandboxes.yml` eklendi. `agent-pr-automation.yml`
kapısı **`.github/workflows/**` dokunan hiçbir PR'ı otomatik merge etmez** (bir
lane kendi denetimini zayıflatamasın diye) → PR `agent:blocked` aldı ve insan
onayı beklerken **kapasite sızıntısı düzelmeden kaldı**. Çözüm: reaper'ı ayrı
workflow yerine **mevcut autopilot geçişinin içine** bağlamak. Autopilot zaten
zamanlanmış çalışıyor; PR artık yalnız `scripts/**` dokunur → kapıyı geçer,
otomatik merge edilir. Ders: **bekçi işini kapının arkasına koyma** — ayrı bir
workflow dosyası, düzeltmeyi kendi kapısının arkasında kilitler.

`scripts/lane-autopilot.mjs` içinde `main()` sandbox sayımından **önce**
`reapStalledSandboxes({ key })` çağırır; böylece bu geçişte açılan slotlar hemen
kullanılır. Reap `--dry-run`'da atlanır (karar değil, bakım işi) ve hata
durumunda geçişi durdurmaz (fırsatçı bakım).

**Test.** `scripts/reap-stalled-sandboxes.test.mjs` — 17 test. Saf seçim kararı
(`selectStalledSandboxes`) + orkestrasyon (`reapStalledSandboxes`, enjekte edilen
sahte `request` ile: max-pauses tavanı, 404 = zaten geri alınmış, hata toplama).
En kritikleri: "paylaşılan sandbox'ta canlı konuşma varsa dokunma" ve "idle
terminal değildir".

**Ders.** Yine "gösterge kimi ölçüyor?" sınıfı: autopilot sandbox'ın `RUNNING`
olmasını "iş var" sanıyor; oysa `RUNNING`, "kimse bırakmadı" demek olabilir.
Bekçi ile gerçek iş sinyalini ayır.

## Tur notları — eşzamanlı PR sınırı, uygulandı (2026-11-08)

**Devredilen görev (issue #430) tamamlandı.** Sahibin bıraktığı "eşzamanlı PR
sınırı" işi kodlandı, test edildi, kanıtlandı.

**Uygulama.** `scripts/lanes.json`'a `"maxOpenPRs": 4` eklendi (tek kaynak).
Sınır, POLICY.md'nin "dalga başına 4–6 lane" bandının **alt** ucudur. Autopilot
kararı `scripts/lane-autopilot-core.mjs`'teki **saf** `prCapacity(openPrs,
maxOpenPRs)` ile verilir: `max(0, limit − open)`, geçersiz/0 limit → `Infinity`
(yapılandırılmamış repo eski davranışta kalır). `lane-autopilot.mjs` bu slot
sayısını iki bağımsız frende biri olarak kullanır:

- **sandbox bütçesi** taze sandbox sayısını sınırlar (eskiden tek fren);
- **PR sınırı** bu geçişte kaç lane'in PR açabileceğini sınırlar.

Reuse/resume lane'leri kota harcamaz, o yüzden önce değerlendirilir — ama yine de
**PR slotu** harcar, çünkü kuyruğa giren şey PR'dır. Sınır aşılırsa spawn
**deferred** olur (düşürülmez); sonraki geçişte bir merge slot açınca başlar.
**Merge'ler sınıra tabi değildir**, böylece kuyruk kendini boşaltır.

**Ölçüm (istenen kanıt).** GitHub Actions API'den job düzeyinde
`started_at − created_at` (= runner kuyruk beklemesi):

| Rejim | Job | Kuyruk bekleme (ort/en büyük) |
|---|---|---|
| Yüksek (6 Kas ~20:00, 5–6 eşzamanlı run) | 35 | 2.0 s / 3 s |
| Düşük (8–9 Kas, 0–1 eşzamanlı run) | 35 | 1.9 s / 3 s |

**Dürüst bulgu:** kuyruk beklemesi **her iki rejimde de ~2 s** — yani bugünkü
gerçek darboğaz kuyruk *değil*. #430'un tablosundaki "5–6 bekleyen check" ise
bekleyen *job* sayısı, *bekleme süresi* değil; E2E shard'ları bugün ≤ 9.7 dk
(#421'deki 17 dk tek seferlik görünüyor). Sınırın değeri bu yüzden "bugünkü
beklemeyi kısaltmak" değil, **eşzamanlılığı POLICY bandında tutan bir tavan
koymak**: 10 lane aynı anda PR üretirse kuyruk doğrusal büyür ve 2026-11-04'te
bir run 24 dk'ya çıkmıştı (POLICY.md). Sınır bunun tekrarını önler.

**Dry-run kanıtı (sınır dolduğunda doğru karar).** Sınırlı geçişte autopilot
şunu yazıyor: `open PRs: 0 (limit 4)`, ilk 4 başlatılabilir lane `spawn`, geri
kalan her lane `deferred  … (PR limit: pass may open 4 (open 0, cap 4))`. Yani
sınır aşıldığında yeni lane başlatılmıyor, sebep raporlanıyor.

**Test.** `scripts/lane-autopilot-core.test.mjs`'e 4 test eklendi (altında sınır
altı → slot var, sınırda/üstünde → 0, eksik/≤0 limit → sınırsız, eksik/negatif
open → 0 sayılır). Tam `test:unit` **779 test / 777 geçti / 0 kaldı**; `lint`,
`typecheck` temiz.

**Ders.** Bir "verim" şikâyeti ölçülmeden doğru kabul edilmemeli: #430 "bekleme
artıyor" diyordu, ölçüm bunu **doğrulamadı**. Doğru refleks, istenen sınırı yine
de koymak — ama gerekçesini ölçüme göre düzeltmek (tavan/eşzamanlılık denetimi),
uydurma bir "öncesi/sonrası kazanç" yazmamak.

---

## Tur 2 — #453: kırmızı PR'ında donan lane yeniden başlatılır

**Sorun.** Autopilot açık bir PR'ı her zaman "in flight" sayıp lane'i bekletiyordu.
Bir lane'in sandbox'ı ölmüşse ama PR'ı kırmızıysa onu düzeltecek kimse kalmıyordu:
lane kendi kırmızı PR'ında sonsuza dek donuyordu (#453).

**Neden `mergeStateStatus` yetmiyor.** Branch protection'da tek zorunlu kontrol
`Quality, database and E2E` (aggregator job, `.github/workflows/ci.yml:315`).
Ama `mergeStateStatus` hem *zorunlu* hem *zorunlu olmayan* kırmızıyı `BLOCKED`
gösteriyor. Zorunlu-olmayan bir hata (ör. Vercel build-rate limiti — dış kota,
lane'in kodu değil) lane'i uyandırmamalı; yoksa her kota tıkanıklığında tüm takım
uyanır.

**Çözüm.** Check rollup doğrudan okunur:

- `scripts/lanes.json` → `requiredChecks: ["Quality, database and E2E"]`.
- `scripts/lane-autopilot-core.mjs` → `failedRequiredChecks(checks, required)`:
  yalnız `FAILURE`/`TIMED_OUT` sonuçlu **zorunlu** check'leri döndürür. Eksik ya da
  hâlâ çalışan check *hata değildir* (bekleyen koşu lane'i uyandırmaz).
- `scripts/lane-autopilot.mjs` → `openPullRequests()` artık `statusCheckRollup`
  de alıyor; `decide()` kırmızı zorunlu check varsa `spawn` (düzelt) döndürür,
  yoksa eskisi gibi `wait`. Deneme bütçesi dolmuşsa `exhausted` (insan gerekir).
- `workSignature({prNumber})` → `pr-fix:<n>`: PR düzeltme turu kendi iş
  imzasına sahip; PR'ı açan işin denemelerini devralmaz (#471 mantığıyla tutarlı).
- `scripts/lane-kickoff.mjs` → `context.redPr` verilince prompt "yeni iş başlatma,
  **kendi PR'ını düzelt**" der (`gh pr checks <n>`, aynı branch'e push).

**Test.** `lane-autopilot-core.test.mjs`'e 6 test, `lane-kickoff.test.mjs`'e 2 test
eklendi (zorunlu hata → isimle döner; TIMED_OUT hata; zorunlu-olmayan kırmızı
uyandırmaz; pending/eksik hata değil; eski `context` alanı; `requiredChecks` boş →
hiç hata yok; `pr-fix` iş imzası; kırmızı-PR promptu). Tam `test:unit`
**788 test / 786 geçti / 0 kaldı**; `lint`, `typecheck`, `check:frontend-source`
temiz.

**Doğrulama.** `gh api .../branches/main/protection` → tek context
`Quality, database and E2E`; PR #478 rollup'ında bu isim (workflow `isbulkktc CI`)
mevcut. Yani helper canlı veriyle eşleşiyor.

---

## Tur 3 — süresiz `running` zombisi kesilir + duraklatılmış sandbox geri alınır (2026-11-08)

**İki arıza, tek kök sınıf: bir sinyal yanlış okunuyor.**

**A) Autopilot hiçbir zaman `running` bir konuşmayı kesmiyordu.** `working` kümesi
her `running` konuşmayı meşgul sayar ve `decide()` dalı var olan bir lane için
`wait` döndürür. Dolayısıyla **döngüye giren** bir konuşma — aynı brief'i tekrar
okuyup `git status` çalıştıran, hiç commit atmayan — `running`'den hiç çıkmaz,
her geçişte atlanır ve sonsuza dek token yakar. Canlı kanıt: bir lane **13,5 saat**,
**~180M prompt token**, **sıfır commit/PR**. Platform durdurmuyor; reaper ise
yalnız zaten terminal konuşmaların sandbox'ını geri alıyor — yani hiçbir şey
durdurmuyordu.

**B) `paused` sandbox geri alınmıyordu.** Reaper'ın `ACTIVE_STATUSES`'i `paused`
içeriyordu, o yüzden kesilmiş bir konuşmanın sandbox'ı **sonsuza dek** RUNNING
kalıp bir bütçe slotunu tutuyordu (#218 sınıfı).

**Çözüm.**

- `scripts/lane-autopilot-core.mjs` → **saf** `stalledConversations(conversations,
  {now, maxRuntimeMs})`: `LANE-*` başlıklı, `running`, `maxRuntimeMs`'ten eski ve
  **hiç PR açmamış** konuşmaları döndürür. `maxRuntimeMs <= 0` bekçiyi kapatır
  (boş/eksik eşik hiçbir şeyi kesmez — `approve-pending-runs`'u ısıran `""` tuzağı).
  `pr_number` API'de **dizi** (`[]`) döner; boş dizi truthy olduğu için sayılır,
  test edilmez.
- `scripts/lane-autopilot.mjs` → geçişte bu konuşmaları `/interrupt` ile keser
  (sandbox'ın kendi konuşma API'si: `conversation_url` + `session_api_key`), kesilen
  id'leri `busyConversations`'tan çıkarır, dry-run'da yalnız önizler. Eşik:
  `scripts/lanes.json` → `"maxConversationRuntimeMinutes": 120`.
- `scripts/reap-stalled-sandboxes.mjs` → `TERMINAL_STATUSES` → **`RECLAIMABLE_STATUSES`**
  = `{error, finished, stuck, paused}`; `paused` `ACTIVE_STATUSES`'ten çıkarıldı.

**Neden 120 dk.** Ölçüldü: sağlıklı bir lane görevi ≤ ~60 dk sürüyor (E2E shard
≤ 9,7 dk, en uzun lane turu ~45 dk). 120 dk, gerçek bir turu kesmeyecek kadar geniş
ama 13,5 saatlik bir döngüyü ilk geçişte yakalayacak kadar dar.

**Güvenlik sınırı.** Bekçi yalnız `LANE-*` başlıklı konuşmalara dokunur — operatörün
kendi (veya insan eliyle çalışan herhangi bir) konuşmasını **kesmez**. `idle`
konuşma zaten `running` değil; `waiting_for_confirmation` insan beklediği için
dokunulmaz.

**Test.** `lane-autopilot-core.test.mjs`'e 9 test (bütçe aşımı → kesilir; bütçe
içi → değil; PR açmış → asla; yalnız `running`; yalnız `LANE-*`; eşik ≤0 kapatır;
ayrıştırılamayan `created_at` atlanır; boş girdi; sıra korunur). `reap-stalled-sandboxes.test.mjs`'e 2 test
(duraklatılmış konuşmanın sandbox'ı geri alınır; paylaşılan sandbox'ta canlı
konuşma varsa dokunulmaz). Tüm script testleri **158/158**; `lint`/`syntax` temiz.

**Doğrulama.** `node scripts/lane-autopilot.mjs --dry-run` → canlı durumla uyumlu:
iki `running` lane 0,8 sa (bekçi dokunmaz), operatör konuşması (14,6 sa) başlık
öneki olmadığı için hariç. Saat kayması yok (ortam saati 12:38 UTC).

**Ders.** Yine "gösterge kimi ölçüyor?" sınıfı: `running` "iş sürüyor" demek
**sanılıyordu**; oysa `running`, "bitmedi" demek — bazen "sonsuza dek bitmeyecek"
demek. Bekçi, meşguliyeti *süreyle* çapraz kontrol eder.

---

## Round: zehirli transcript — kesmek yetmiyor, beslememek gerek (#218, 2026-11-09)

**Arıza.** Önceki round `stalledConversations` bekçisini ekledi: `running` +
bütçe aşımı + PR yok → `/interrupt`. Ama bu yalnızca **o anki** döngüyü durdurdu.
Kesilen konuşma `paused`'a döndü; bir sonraki geçiş onu **yeniden kullanılabilir /
devam ettirilebilir** sayıp aynı sandbox'a yeni görev verdi. Transcript her turda
tüm geçmişi yeniden gönderdiği için sızıntı **bileşik** büyüdü: canlı kanıt, bir
Supabase konuşması **34.5M prompt token**, **0 PR**; sekiz lane toplamda **~863M
prompt token**, **0 PR** (en kötü LANE-icerik 215M / 667 dk). Tek bir 16:25 geçişi
**6 lane'i birden** kesti.

**İki bağlı hata.**
- `idle` durumu interrupt'tan **önce** hesaplanıyordu → az önce kesilen konuşma
  aynı geçişte "yeniden kullanılabilir" görünüyordu.
- `resumable` (devam ettirme) yolu **MAX_REUSES** sınırını atlıyordu → `paused`
  konuşma sınırsız ekleniyordu.

**Çözüm.**
- `scripts/lane-autopilot-core.mjs` → saf **`poisonedConversations(conversations,
  {now, maxRuntimeMs})`**: `LANE-*`, bütçe aşımı, PR yok — **durumdan bağımsız**.
  `waiting_for_confirmation` (insan bekliyor, döngü değil) hariç. `stalledConversations`
  artık bunun üzerine kurulu: **zehirli = stall + zaten kesilmiş olanlar.**
- `scripts/lane-autopilot.mjs` → `poisoned` kümesi interrupt'tan **önce** bir kez
  hesaplanır ve hem `idle` (reuse) hem `paused` (resume) hedeflerinden dışlanır.
  Resume yoluna reuse bütçesi eklendi: `MAX_REUSES` dolunca aynı (kota-dışı)
  sandbox'ta **taze transcript** başlatılır. Lane'in tek sandbox'ı yalnız zehirli
  konuşma taşıyorsa: resume edilip üzerinde taze transcript açılır; bu kurtarma
  **kota-dışı** sayılıp sandbox bütçesi / PR kapısına takılmaz.

**Neden durumdan bağımsız.** Bekçinin asıl dersi: "kesmek" yeterli değil; kesilen
konuşma hâlâ bir **reuse hedefi** olarak duruyorsa aynı sızıntı geri gelir. Zehir
`running`'e değil, konuşmanın **kimliğine** (yaş + PR'sızlık) bağlanmalı.

**Test.** `lane-autopilot-core.test.mjs`'e 6 test: durumdan bağımsızlık (running/
paused/idle/error/finished hepsi zehirli), PR affı, `waiting_for_confirmation`
bloklu, bütçe içi temiz, "poison ⊇ stall" ilişkisi, hatalı/eksik girdi. Tüm script
testleri **178/178**; `eslint`/`node --check` temiz.

**Doğrulama.** Canlı durum: `LANE-supabase` (sb `3qgonSUwLkuTnnQwGr5BVo`) ve
`LANE-urun` (sb `6BN0TvWUdNywzIhCXZnmnJ`) `execution_status: None`, PR yok —
poison sınıfına girer; yeni yol bunları beslemek yerine taze transcript'le kurtarır.
Ortam saati ile API `created_at` uyumlu (17:25 UTC), saat kayması yok.

**Ders.** Ölçüm, düzeltmenin gerçekten durduğunu doğrulamalı: bekçi eklendikten
sonra token eğrisi düşmediyse, kesilen sinyal yanlış yerde demektir. Burada kesme
doğruydu, ama **besleme** yolunda bir açık kalmıştı.

## Round: açlık + treadmill — kotasız grup tüm slotları yiyor, taze transcript sayacı sıfırlıyor (2026-11-09)

**Belirti.** LANE-urun (#462) hiç ilerlemiyor; tüm lane dalları 11-06/11-07'de
donmuş, bugün sıfır yeni commit; son operatör-olmayan merge #489'dan önce yalnız
operatör PR'ları. Yani **alan lane'leri hiç PR üretmiyor** — operatör yalnız kendi
autopilot'unu düzeltiyor (kendine referanslı döngü).

**İki bağımsız kök neden.**

1. **Açlık (starvation).** `lane-autopilot.mjs`'te `startable = [...quotaFree,
   ...freshAllowed]; allowed = startable.slice(0, prSlots)`. Kota-dışı grup
   (reuse + resume + zehirli-sandbox kurtarma) **önce** listeleniyordu. Her lane'de
   zehirli bir sandbox olduğu için bu grup neredeyse her geçişte `prSlots`'tan
   (4) büyüktü → **tüm slotları yiyordu**. `fresh` grubu (yeni sandbox açabilen,
   yeni iş üretebilen lane'ler: urun, tasarim, guvenlik, infra) hiç çalışmadı —
   `open PRs: 0` iken bile. Bu bir **açlık**, kuyruk dolu değil.

2. **Treadmill (koşu bandı).** `laneDelivered('REFRESHED')` **true** dönüyordu.
   `REFRESHED`, zehirli transcript'in bırakılıp **aynı sandbox'ta taze transcript**
   başlatılmasıdır — bir **yeniden başlatma**, bir teslimat değil. Ama
   `carriedAttempts` bunu "teslim etti" sayıp denemeleri **0'a** sıfırlıyordu. Sonuç:
   hiç PR üretmeyen bir lane **asla** `MAX_ATTEMPTS`'e ulaşmıyor, sonsuza dek taze
   transcript'le yeniden doğuyordu — canlı kanıt: `cloudflare attempt 9` (üst sınır 3).
   İkinci tutarsızlık: saklanan `entry.attempts` ham sayıyordu; sıfırlama yalnız
   `decide()`'in görünümünde kalıyordu, kalıcılaşmıyordu.

**Çözüm.**

- `scripts/lane-autopilot-core.mjs`:
  - `laneDelivered` artık `['RUNNING','REUSED','RESUMED']` — `REFRESHED` çıkarıldı.
  - Yeni saf `selectSlots(quotaFree, fresh, slots)`: taze gruba **en az bir slot**
    ayırır (`cap>=2` ve `fresh` dolu iken `freshQuota = max(1, ceil(cap/2))`).
    Tek slot kota-dışı grupta kalır (kota-dışı olan kota beklememeli); `fresh` boşsa
    tüm slotlar kota-dışına gider. Sıralama (fairOrder rotasyonu) korunur.
- `scripts/lane-autopilot.mjs`:
  - Slot bloğu `selectSlots(quotaFree, freshAllowed, prSlots)` kullanır; `overPrCap`
    artık onun `deferred`'ı (erteleme gerekçeleri değişmedi).
  - Spawn döngüsü `entry.attempts`'i `carriedAttempts(entry, work)` ile **senkronlar**,
    böylece saklanan sayaç ile karar kapısı hep aynı sayıyı görür (tırmanan ham sayaç
    biter).

**Test.** `lane-autopilot-core.test.mjs`: `REFRESHED` artık sıfırlamıyor (yeni test),
`laneDelivered` listesi güncellendi, `selectSlots` için 6 test (taze garantili slot,
yarı-yarı bölüşüm, boş `fresh`, tek slot, sıfır slot, sıra korunumu). Core **74/74**,
tüm script testleri **185/185**; `eslint` temiz.

**Neden bu ikisi birlikte gerekli.** Açlık düzeltilmezse taze lane hiç slot almaz;
treadmill düzeltilmezse kota-dışı lane sonsuza dek döner ve slotları yine tüketir.
Biri "kim çalışacak", diğeri "ne zaman duracak" sorusunu yanıtlar.

**Sonraki.** #462 karar-kapılı (KVKK/gizlilik, kod değil) — insana yönlendir, lane
yakma. #398 gerçek iş (kendi widget'ı, CSP değişmez). 15 PAUSED ölü sandbox reaper'la
temizlenmeli; 45 dk `maxConversationRuntimeMinutes` bir lane'in kurulum+denetim
süresinden kısa olabilir → transcript PR'dan önce sıfırlanıyor.

## Round: sağlık kapısı 0-job glitch'i gerçek kırmızı sanıyordu (#218, 2026-11-09)

**Belirti.** `system-health.mjs` 19:01'de "main CI kırmızı" deyip **FAIL** (exit 1)
verdi. `--json` dökümünde main'de iki workflow kırmızıydı: `Dispatch web push` ve
`System health`. İkincisi zaten hariç; ama `Dispatch web push` kırmızısı gerçek
miydi?

**Kök neden.** Run nesneleri yapısal olarak aynıydı (ikisi de `conclusion=failure`,
`status=completed`, `run_attempt=1`, `event=schedule`); tek fark **job sayısı**:
`gh api .../runs/<id>/jobs --jq .total_count` → glitch koşu **0**, gerçek kırmızı
**1**. GitHub'ın zamanlayıcısı ara sıra bir koşuyu hiç başlatmadan `failure` işaretler
(sıfır job, sıfır log). Bu, `redWorkflowsOnMain`'in `conclusion === 'failure'`
süzgecinden **gerçek kırmızı gibi** geçiyordu → hem yanlış FAIL hem de aynı raporda
gerçek kırmızıyı gürültüye gömme riski (aile #7, "gösterge yalan söylüyor").

**Çözüm.**

- `scripts/system-health-core.mjs`:
  - Yeni `redRunsOnMain(runs)` — kırmızı koşuları **nesne olarak** döndürür (çağıran
    `databaseId`'yi okuyabilsin); `redWorkflowsOnMain` artık onun `.map(name)`'i
    (davranış aynı, tek kaynak).
  - Yeni saf `classifyRedRuns(redRuns)`: `jobCount === 0` → `glitches`, aksi
    (`>0` **ve** `null`) → `real`. **Fail-safe:** job sayısı bilinmiyorsa (`null`,
    sorgu düştü) koşu **gerçek** sayılır — bir kapı, bakamadığı için kırmızıyı yeşile
    çevirmemeli.
- `scripts/system-health.mjs`: 3. adım artık `--json`'a `databaseId` ekler, kırmızı
  koşular için `jobCountOf(runId)` (hata → `null`) çeker, `classifyRedRuns` ile
  ayırır. Gerçek kırmızı → `fail`; yalnız glitch → `warn` ("transient 0-job run");
  hiçbiri → `ok`.

**Test.** `scripts/system-health.test.mjs`: `redRunsOnMain` nesne/kendi-workflow
hariç (2), `classifyRedRuns` 0-job→glitch, >0→gerçek, `null`/alan yok→gerçek
(fail-safe), gerçek+glitch ayrışması, boş (5). `node --test scripts/*.test.mjs`
**193/193**; `eslint` temiz. Canlı `node scripts/system-health.mjs` → exit **0**
(glitch koşu artık FAIL değil).

**Ders.** Aynı sınıf: bir sinyal yanlış okunuyor. `conclusion=failure` tek başına
"kırıldı" demek değil; **iş gerçekten koştu mu** (job sayısı) ayırt edici. Fail-safe
yön önemli: kanıt yoksa gürültüyü bastırma, kırmızıyı koru.

**Sonraki.** #490 (açlık+treadmill) 18:53'te merge oldu ama **henüz bir sonraki
autopilot geçişinde denenmedi** (18:52 geçişi eski kodla koştu, urun/guvenlik
`attempt 5`). Bir sonraki `*/20` geçişinde attempt sayacının 3'te durması
doğrulanmalı. 14 lane #474–#490 arası sıfır alan PR'ı üretti (yalnız operatör);
sandbox açlığı/tükenmesi sürüyorsa kök neden lane-içi değil.


## Round: commit sinyali — zombiyi yaşla değil commit'le kes (#218, 2026-11-09)

**Belirti.** Süresiz `running` zombisi sürüyor: bir lane her geçişte "meşgul"
görünüyor, `updated_at` sürekli hareket ediyor (grep + yeniden okuma döngüsü), ne
PR ne commit üretiyor. Yaş tavanı (`maxConversationRuntimeMinutes`) ve boşta kalma
(`maxConversationIdleMinutes`) sinyalleri bunu geç yakalar: biri sabit yaş, diğeri
`updated_at`'e bakar — döngü `updated_at`'i diri tutar. Brief'in adlandırdığı kriter
ise yaş değil, **"pencerede commit/push yok"**.

**Kök neden.** Autopilot'un elinde commit verisi yoktu. `fetch-depth: 1` yüzünden
runner'da yalnız `origin/main` var, yerel lane ref'leri **yok**; dolayısıyla
`git branch -r` ile okumak her lane'i commit'siz sanıp tüm takımı zehirlerdi. Sinyal
için API şart.

**Çözüm.**

- `scripts/lane-autopilot.mjs` → yeni `laneCommitTimes()`: **tek** GraphQL çağrısıyla
  `refs/heads/lane/*` başlarının `committedDate`'ini çeker, `Map<laneAdı, epoch ms>`
  döndürür. Sorgu düşerse `null` döner → çağıran sinyali **kapatır** (veri yokluğu
  hiçbir lane'i zehirlemez); dal adı uyuşmazlığında tüm takımı birden zehirlemeyi
  önler. `main()` içinde pencere kapalıyken hiç çağrılmaz (kotasız ekstra API yok).
- `scripts/lane-autopilot-core.mjs` → saf **`noCommitInWindow({commitAt, since,
  now, windowMs})`**: pencere geçmeden hüküm vermez (taze lane yargılanmaz), başlangıçtan
  sonra commit varsa sinyal temizlenir. `poisonedConversations`'a `commitsByLane` +
  `noCommitMs` eklendi. **Karar döngüde:** haritada girdisi olmayan lane bu sinyalde
  *yargılanmaz* (yaş/boşta sinyalleri karar verir) — `undefined` ≠ "commit yok".
- `scripts/lanes.json` → `"laneCommitWindowMinutes": 25` (kickoff ilk ~10 dk'da commit
  ister; 25 dk sağlıklı lane'e pay bırakır, 45 dk tavandan önce döngüyü yakalar).

**Test.** `lane-autopilot-core.test.mjs` 5 commit-sinyali testi: pencerede commit yok
→ zehir; başlangıçtan sonra commit → temiz; haritada girdi yok (boş Map) → yargılanmaz;
düz nesne de kabul; pencere geçmeden hüküm yok. `node --test scripts/*.test.mjs`
**209/209**; `SYNTAX OK`, `JSON OK`.

**Ders.** Üç sinyal üç farklı soruyu yanıtlar: boşta = "sandbox ölmüş mü", yaş tavanı
= "ne kadar uzun sürdü", commit penceresi = "gerçekten ilerliyor mu". Bir döngü
`updated_at`'i diri tuttuğu için yalnız ilk ikisi onu kaçırır; üçüncüsü diske bakınca
yakalar.

**Sonraki.** Bir sonraki `*/20` geçişinde commit sinyalinin gerçek veriyle çalıştığı
doğrulanmalı (log'da "lane commit times unavailable" görünmemeli). #490'ın attempt
tavanı da aynı geçişte teyit edilmeli.

## Round: commit sinyali çalışan lane'i yanlış kesiyordu (#218, 2026-11-10)

**Belirti.** Önceki turun "sonraki" maddesi sinyali gerçek veriyle doğrulamayı
istiyordu. Sinyal **çalıştı** — ve hemen yanlış pozitif üretti: `--dry-run` çıktısı
`would interrupt stalled LANE-supabase` dedi. Oysa LANE-supabase **canlı çalışıyordu**
(yerelde 23:05/23:08 commit'leri vardı), yalnız PR açmadığı için uzak dalına henüz
push etmemişti.

**Kök neden.** Commit sinyali **uzak** dalın son commit'ine bakıyor
(`refs/heads/lane/*`). Ama bir lane **yerelde** commit'ler ve dalına yalnız PR
açarken/güncellerken push eder (kickoff bunu söyler; operatör de öyle yapar). Dolayısıyla
çalışan bir lane'in uzak dalı iş boyunca **geride** kalır: LANE-supabase yerelde
23:05/23:08 tutarken `refs/heads/lane/supabase` hâlâ **17:49** okunuyordu ve sinyal
"pencerede commit yok" dedi. Bu, brief'in adlandırdığı **"gösterge yanlış şeyi okuyor"**
ailesidir: sinyal *uzak dalı* ölçüyor, oysa sorduğu soru "lane ilerliyor mu". Çalışan
bir lane'i kesmek **canlı işi öldürürdü**.

**Çözüm.** `poisonedConversations` içinde commit sinyali artık yalnızca **duran**
(`!running`) lane için değerlendirilir:

```js
const noCommit = !running && commitAt !== undefined && noCommitInWindow({…});
```

Çalışan lane zaten iki sinyalle yargılanır — boşta kalma (`idle`) ve sert yaş tavanı
(`overCeiling`) —; "okuma döngüsü"nü yaş tavanı yakalar (mevcut test). Duran bir lane
için sinyal dürüsttür: "hiç push etmedi" gerçekten "hiçbir şey bırakmadı" demektir;
sızmış transcript'in devam ettirilmemesi gereken durum tam da budur.

**Test.** `lane-autopilot-core.test.mjs`: eski "çalışan lane commit'siz zehirlenir"
testi **"duran lane commit'siz zehirlenir"** olarak düzeltildi (`execution_status:
"finished"`); yeni test **"çalışan lane asla commit'siz yargılanmaz"** eklendi
(LANE-supabase senaryosu, uzak dal 2 saat geride). Commit sinyalini çağıran diğer
"spared"/"unreadable map" testleri de duran lane'e çevrildi. `node --test
scripts/*.test.mjs` **222/222**; `test:unit` **887/0**; `lint`/`typecheck`/
`check:frontend-source` temiz.

**Ders.** Sinyal eklerken sor: **hangi anlık görüntüyü okuyor, o görüntü kararın
konusunu gerçekten yansıtıyor mu?** Uzak dal yerel işi gecikmeli yansıtır; gecikmeli
bir görüntü üzerinden "şu an ilerliyor mu" sorusuna cevap verilemez.

## Round: çakışan PR lane'i sonsuza dek donduruyor + kota kilidi (#493, 2026-11-08)

**Belirti.** `lane/infra` PR **#493** 7 saat açık, `DIRTY`/`CONFLICTING`, hiç
dokunulmamış. Tüm kontrolleri **yeşil** (`mergeable: CONFLICTING` ama
`statusCheckRollup` tümü SUCCESS). PR açık PR kotasını (4) tutuyor ve diğer
lane'leri tıkıyor olabilir.

**Kök neden 1 — sessiz dead-end.** GitHub `CONFLICTING` bir head için **hiç
check-run ateşlemez**. Dolayısıyla `failedRequiredChecks` **boş** döner, `decide()`
PR'ı "in flight" sayar ve lane'i **sonsuza dek `wait`**'e koyar. #453'ün (kırmızı PR
lane'i dondurur) çakışma için düzeltilmemiş hâli: kırmızı kontrol için çıkış yolu
vardı, çakışma için yoktu. Sandbox gitmiş, kimse rebase etmez → PR hep çakışır →
hep kotayı tutar.

**Kök neden 2 — kota kilidi.** `decide()` artık çakışmada da `spawn` (fix) üretse
bile, fix-spawn **PR kotasına** takılıyordu: `prSlots = cap − openPrs`. Kota doluysa
fix ertelenir → çakışan PR düzeltilemez → PR kapanmaz → kota açılmaz. **Kilitli
döngü.** Fix'lerin ertelenmesi kotayı asla boşaltamaz.

**Çözüm.**
1. `lane-autopilot-core.mjs`: `pullRequestConflicts(pr)` — yalnız açık
   `mergeable === 'CONFLICTING'` ya da `mergeStateStatus === 'DIRTY'`. `null`/`UNKNOWN`
   **çakışma sayılmaz** (GitHub merge'i henüz hesaplamamış olabilir; tahmin etmek
   gereksiz uyandırır).
2. `lane-autopilot.mjs` `decide()`: `failed.length > 0 || conflicts` tek kapı;
   çakışmada `redPr.checks` **boş**, `previousError` "rebase onto origin/main" der.
3. `lane-kickoff.mjs`: `redPr` promptu çakışmada "rebase" der (eskiden `kırmızı ()`
   yazıyordu), kırmızıda `gh pr checks` der.
4. `lane-autopilot-core.mjs`: `exemptFixes(allowed, deferred)` — `context.redPr`
   taşıyan ertelenmiş kararları kotadan **muaf** tutar, `allowed`'un **önüne** koyar.
   Fix yeni PR açmaz (mevcut PR'ı onarır), yani kuyruğa PR eklemez.

**Test.** `lane-autopilot-core.test.mjs`: `pullRequestConflicts` (4 test) +
`exemptFixes` (4 test). `lane-kickoff.test.mjs`: çakışma respawn promptu rebase der,
`gh pr checks` demez. `node --test scripts/*.test.mjs` **261/261**; eslint temiz.

**Ders.** Bir "ertele" kapısı ile "onar" işi aynı kaynağı paylaşıyorsa, onarımı
erteleyen kapı kendi kuyruğunu asla boşaltamaz. Onarım (mevcut PR'ı düzeltmek)
yeni iş açmaz; bu yüzden kotaya **sayılmamalı**, hatta öne alınmalıdır.


## Round: yeni Vercel hesabı + canlıya alma + CI kırmızılarını kapatma (2026-11-08)

**Belirti.** Eski Vercel hesabı bloke (`Account is blocked.`) → site her istekte
`402 DEPLOYMENT_DISABLED` / `404 DEPLOYMENT_NOT_FOUND`. Sahip bloke deployment'ı
sildi, **yeni hesap açıp token verdi**; yeni hesapta proje **yoktu**, operatör
oluşturdu.

**Yapılan (yeni hesap `is-bulkktc`, `team_I2cTA4dN4vPBccgDZmNceVgD`).**
- Proje `isbulkktc` (`prj_oEsui6Gj9lPd2ufmoR5S0e9dbCTf`, nextjs, Node 24.x),
  domainler `isbulkktc.com` + `www.isbulkktc.com`, ortam değişkenleri
  (`APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, publishable + service-role anahtarları,
  `AUTH_OAUTH_PROVIDERS`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `PUSH_CRON_SECRET`).
- `main` üretime deploy; canlı commit **`3644cbe3`**. Apex/www/api 200.

**CI onarımı (repo ayarı + Vercel, kod değişikliği YOK).** İki zamanlı iş
kırmızıydı; ikisinin de kökü **eski hesabın alias'ı** `isbulkktc-amber.vercel.app`
(artık `DEPLOYMENT_NOT_FOUND`):
1. `Dispatch web push` → alias + yeni projede `PUSH_CRON_SECRET` yoktu (401).
2. `Submit sitemap to IndexNow` → alias.

Çözüm, sahiplik sınırını aşmadan: (a) `PUSH_CRON_SECRET` **döndürüldü**, hem
Vercel env (3 ortam) hem repo secret yazıldı; (b) eski alias `isbulkktc-amber.vercel.app`
**yeni projeye domain olarak eklendi** (public + production'a takip eder) → hardcoded
referanslar **hiç dokunulmadan** çalışır. (c) `PUSH_DISPATCH_ORIGIN` /
`INDEXNOW_SITEMAP_ORIGIN` repo değişkenleri yeni stabil alias'a (`isbulkktc-prod.vercel.app`)
ayarlandı; (d) `VERCEL` secret + `VERCEL_TEAM_SLUG/ID/PROJECT` değişkenleri yeni
hesaba güncellendi.

**Ders.** `.github/**` ve `scripts/**` **LANE-INFRA**'nın; operator kod değiştirmeden
sorunu **kaynağında** çözmeli. Kırık bir alias'ı silmek yerine **sahiplenmek**
(`vercel domains add`) hardcoded referansı tek hamlede onarır. Aynı şekilde eksik
bir cron secret'ı env'e yazmak, workflow'a varsayılan eklemekten daha az riskli.

**Kanıt.** `Verify production deployment` ✅ (API: "alias built from 3644cbe3"),
`Prune Vercel deployments` ✅ (yeni token; 2 deployment, 0 silindi),
`Dispatch web push` ✅ (200), `Submit sitemap` ✅ (207 URL), `system-health`
**0 failure** ("every workflow on main is green").

**Kalan (sahip/LANE-INFRA).** Yeni hesapta otomatik Git deploy yok
(`git connect` → 400, GitHub login bağlantısı ister). #547 açıldı; yapılmazsa
sonraki `main` push'u otomatik deploy olmaz ve `verify` kırmızıya döner.

## Tıkanıklık ailesi 8: yerel eksik → **global** kırmızı (lane-collisions) (2026-11-08)

**Görünen.** Operatörün kendi PR'ı (`#548`, yalnız `docs/lanes/15-operator.md`)
`Static checks`'te kırmızı. Kod değişikliği yok, sahiplik temiz — neden kırmızı?

**Gerçek.** Kırmızı adım `Lane collisions` ve o adım **tüm açık PR'ları** okur
(`gh pr list --state open`), yerel farkı değil. Kardeş PR `#549` (`lane/teslimat`),
sahiplik tablosunda **tam adıyla** listelenen `scripts/verify-production-deployment.mjs`
dosyasının **test kardeşini** (`…test.mjs`) düzenliyordu; tablo bu kardeşi kapsamıyor,
ama iki başka lane'in geniş globu (`LANE-VERIFY`, `LANE-INFRA`) kapsıyor. Kapı,
"PR'ın lane'i sahipler arasında yok" diye hata verdi ve **tek PR'ın yerel eksiği
tüm kuyruğu** dondurdu (zorunlu `Quality, database and E2E` → `static`'e bağlı).

**Ders.** `lane-collisions.mjs` gibi **kuyruk-global** kapılarda kırmızı, "benim
PR'ımda hata var" demek **değildir**. Önce suçlanan adımı **yerelde** çalıştır
(`node scripts/lane-collisions.mjs`), çıktı hangi PR'ı adlandırıyorsa **o** PR
sorumludur. Operatör bu sınıfta: kırmızıyı **kendi PR'ına mal etme**, kaynağı
bul, sahibine devret (#552 → LANE-INFRA), kendi PR'ına açıklayıcı yorum bırak.

**Kural eklendi.** "Kuyruk-global kapı kırmızısı, PR-yerel kırmızı değildir:
kırmızı adımı yerelde koştur, adı geçen PR'ı bul, sahibine devret."

## Round: bekçi "PR'lar hareket ediyor" derken kuyruk donmuştu (#493, 2026-11-10)

**Belirti.** `system-health` yeşil: `PRs: N open, all moving`. Ama gerçekte
kuyruk donmuştu — kuyruk-global `lane-collisions` kapısı kırmızıydı ve **hiçbir**
PR merge olamıyordu. Bekçi, donmuş bir kuyruğa "hareket ediyor" dedi.

**Kök neden.** `stuckPullRequests` yalnız **yaşa** bakar: PR 3 saatten eski **ve**
merge durumu `CLEAN` değilse uyarır. Ama (a) taze PR'ları (<3 saat) hiç görmez,
(b) *neden* `BLOCKED` olduğunu görmez. `BLOCKED` + kırmızı check = "kimse
ilerletemiyor çünkü bir kapı reddediyor" — bekçinin **adlandırması gereken** tam
da bu. Bunun yerine "yaşlanmamış" sinyalini "ilerliyor" diye okudu: 5. aile
(gösterge yanlış okuyor), bu kez *zaman* ekseninde.

**Düzeltme (LANE-OPERATÖR dosyaları).** `system-health-core.mjs`'e `isRedCheck`
+ `redPullRequests`; `system-health.mjs`'e `blocked PRs` uyarısı (kırmızı check
adıyla) ve "all moving" koşuluna bu listenin de sıfır olması eklendi. **Yaş
kapısı bilinçli olarak yok:** `UNKNOWN` merge durumu push-sonrası pencereyi zaten
kapatıyor ve rollup'taki `FAILURE` geçerli head SHA içindir — kalıcı bir hüküm.
Yaş kapısı koysaydım donma saatlerce görünmez kalırdı.

**Kanıt.** `scripts/**/*.test.mjs` **289/289** (yeni 8 test), `eslint` temiz.
Canlı koşu artık donmayı adlandırıyor: `blocked PRs  2 open with a red check
(cannot merge): #553 (Static checks); #548 (Static checks)`.

**Ders.** Bir sağlık kontrolü "her şey hareket ediyor" diyorsa, önce **neyi
ölçtüğünü** sor: yalnız zamanı mı, yoksa *sonucu* mu? İkincisi olmadan yeşil,
"henüz eskimedi" demektir — "ilerliyor" değil.

**Kalan (başka lane).** Kuyruk donması hâlâ sürüyor; kaynağı #549'un sahiplik
eksiği (bkz. önceki bölüm), düzeltmesi LANE-INFRA/#552'de. Bekçi artık görünür
kılıyor ama **çözemez** — bu doğru sınır.

## Tur notları — kuyruk-global kapı (2026-11-10)

Önceki tur "kırmızı check'i adlandır"ı ekledi; bu tur **aynı check'in N PR'da
kırmızı olması**nın *tek bir sistemik neden* olduğunu görünür kıldı. Aile #8.

**Bulgu.** `redPullRequests` her PR'ın kırmızısını **ayrı ayrı** listeliyordu:
`blocked PRs 2 open with a red check: #557 (Static checks); #555 (Static checks)`.
Operatör bunu iki bağımsız arıza sanar; gerçekte **tek** kök var —
`lane-collisions.mjs` kuyruğun tamamını okur, `#557`'nin sahipsiz dosyası **her**
PR'ın `Static checks`'ini kırar. Kapı kuyruk-global olduğu için (zorunlu
`Quality, database and E2E`'yi besler) **hiçbir** PR merge olamaz: N kırmızı,
1 neden.

**Düzeltme (LANE-OPERATÖR dosyaları).** `system-health-core.mjs`'e
`queueGlobalGates(prs)`: `redPullRequests` çıktısını check adına göre gruplar;
aynı ad **2+ PR'da** kırmızıysa tek kayıt döner (`{check, prs}`). Tek PR'daki
kırmızı bilinçli olarak **sayılmaz** — o PR'ın kendi arızası olabilir, paylaşılan
kapı olduğu kanıtlanamaz. `system-health.mjs` her kapı için **tek** `queue-global
gate` uyarısı basar.

**Kanıt.** `scripts/system-health.test.mjs` **48/48** (yeni 6 test). Mutasyon:
`queueGlobalGates` `[]` döndürecek şekilde bozulunca **46 pass / 2 fail**;
geri alınınca **48/48**. Canlı koşu artık iki satırı da yazıyor:
```
  WARN blocked PRs       2 open with a red check (cannot merge): #557 (Static checks); #555 (Static checks)
  WARN queue-global gate Static checks is red on 2 PRs (#557, #555): one lane's mistake freezes the whole queue — fix the cause, not each PR
```
`lint`/`typecheck`/`check:frontend-source` temiz, `test:unit` **985/985**.

**Ders.** Bir sinyal **kaç varlıkta** tekrarlandığını söylemiyorsa, operatör
"paylaşılan neden" ile "N bağımsız arıza"yı ayıramaz. Aynı adı taşıyan kırmızıları
grupla; 2+ ise tek sistemik neden olarak sun. Bekçi yine **çözemez** — kapının
kendisi global, düzeltme LANE-INFRA'da (#552'ye yapısal bulgu olarak eklendi).

## Tur notları — toplayıcı işi kendi kapısı sanma (2026-11-10)

Önceki tur "aynı check N PR'da kırmızıysa tek neden"i ekledi. Bu tur aynı
grubun **fazla saydığını** buldu: tek donma **iki** kapı gibi görünüyordu.

**Bulgu.** Canlı koşu iki `queue-global gate` satırı yazıyordu:

```
  WARN queue-global gate Static checks is red on 2 PRs (#557, #555) ...
  WARN queue-global gate Quality, database and E2E is red on 2 PRs (#557, #555) ...
```

`Quality, database and E2E` (`.github/workflows/ci.yml`) **toplayıcı** bir iştir:
`needs: [static, database, e2e]` ve tek yaptığı, bir bağımlılık düştüyse düşmek;
**kendi kapısı yok**. `Static checks` kuyrukta kırmızıyken toplayıcı da **her**
PR'da kırmızıdır. Bu yüzden `queueGlobalGates` **tek** kök nedeni **iki** bağımsız
kapı gibi gösteriyor ve operatörü düzeltilecek kendi hatası olmayan bir işe
yönlendiriyordu — 8. ailenin (gösterge yanlış okuyor) sayaç eksenindeki hâli.

**Düzeltme (LANE-OPERATÖR dosyaları).** `system-health-core.mjs`'e
`CI_AGGREGATOR_CHECKS` eklendi; `queueGlobalGates` toplayıcı adlarını atlar.
`redPullRequests` **bilinçli olarak filtrelenmedi**: PR başına "bu head kırmızı"
bilgisi doğru ve eyleme dönüktür. Bir birim testi toplayıcı adının `ci.yml`'de
`needs:` taşıdığını doğrular (toplayıcı tanımının kanıtı), böylece yeniden
adlandırma çift sayımı geri getiremez.

**Kanıt.** `scripts/system-health.test.mjs` **50/50** (yeni 2 test). Canlı koşu
artık tek satır yazıyor:
```
  WARN queue-global gate Static checks is red on 2 PRs (#557, #555) ...
```
`lint`/`typecheck`/`check:frontend-source` temiz, `test:unit` **987/987**.

**Ders.** Bir kırmızıyı **adlandırdığında** sor: bu iş kendi başına mı karar
veriyor, yoksa yalnız başka bir işi mi aynalıyor? İkincisiyse ayrı bir neden
değil, aynı nedenin ikinci görüntüsüdür; raporla, ama çözüm olarak sunma.
