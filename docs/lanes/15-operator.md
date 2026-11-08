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

**Yeni bir tıkanıklık görürsen:** aynı sınıfta mı diye sor — "bir sinyal yanlış
okunuyor mu?" Genelde cevap evet.

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
RUNNING **10 → 9**, bir slot açıldı. `.github/workflows/reap-stalled-sandboxes.yml`
her autopilot geçişinden hemen sonra (dakika 12/32/52) çalışır.

**Test.** `scripts/reap-stalled-sandboxes.test.mjs` — 11 test; en kritik olanı
"paylaşılan sandbox'ta canlı konuşma varsa dokunma" ve "idle terminal değildir".

**Ders.** Yine "gösterge kimi ölçüyor?" sınıfı: autopilot sandbox'ın `RUNNING`
olmasını "iş var" sanıyor; oysa `RUNNING`, "kimse bırakmadı" demek olabilir.
Bekçi ile gerçek iş sinyalini ayır.
