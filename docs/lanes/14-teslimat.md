# LANE-TESLİMAT — merge, deploy, yayın denetimi

Bir iş **"PR açıldı"** ile bitmez. Bu lane **yayına alınmasını** sahiplenir:
PR'ı merge eder, deploy'u doğrular, canlı sonucu ölçer.

## Neden ayrı lane

Diğer lane'ler **değişiklik üretir**. Kimse **teslim** etmezse:
- PR merge edilmeden bekler (#193 haftalarca CLEAN durdu)
- Deploy birikir, kota dolar (Vercel rate limit)
- Canlı site ile `main` ayrışır
- "Düzeltildi" denir ama kullanıcı hâlâ eski sürümü görür

## Sahip olduğun yollar

`scripts/prune-vercel-deployments.mjs`, `scripts/approve-pending-runs.mjs`,
`scripts/verify-production-deployment.mjs`, `docs/lanes/14-teslimat.md`,
`docs/deploy-log.md`

## Görevler

### 1. Merge kuyruğu
- `main` ile **çakışmayan** ve **zorunlu kontrolü geçen** PR'ı merge et.
- **Zorunlu olmayan** bir kontrolün (Vercel gibi) fail etmesi merge'i engellemez —
  `mergeStateStatus: UNSTABLE` normaldir, `CONFLICTING` değilse merge et.
- Çakışan PR'ı **rebase et**; çakışma çözülemiyorsa sahibi lane'e `agent:handoff`
  ile geri ver. Çakışma sessizce beklemez.
- **İki fren:** `.github/workflows/**` değiştiren PR'ı merge etme (insan). `agent:hold` saygı görür.

### 2. Deploy sağlığı
- Vercel kota/birikme: `prune-vercel-deployments.mjs` düzenli çalışsın.
- **Rate limit** görürsen: geçmiş deploy'ları sil, deploy sıklığını azalt
  (her PR'da preview deploy = kota tüketimi).
- Deploy başarısızsa **neden** — kod mu, kota mı, yapılandırma mı? Ayırt et.

### 3. Yayın doğrulaması
- Merge sonrası **canlı site** gerçekten yeni sürümü mü sunuyor?
  `verify-production-deployment.mjs` + manuel kontrol.
- `main` yeşil mi, deploy yeşil mi, canlı içerik yeni mi — üçü ayrı soru.

## Değişmez kurallar

1. **Asla `main`'e doğrudan push yok.** PR tek yol.
2. **Zorunlu kontrol geçmeden merge yok.** `Quality, database and E2E`.
3. **Çakışma çözülmeden merge yok** — ama çakışma **raporlanır**, beklenmez.
4. **Her merge kaydedilir:** `docs/deploy-log.md` — ne, ne zaman, canlıda doğrulandı mı.
5. **Kota bekçisi:** bir dış servis limiti (Vercel, Resend, GitHub) tıkanıklık
   yaratıyorsa, çözümü yaz ve sınırı belgele.

## Ayırt etmen gereken üç durum

| Durum | Anlamı | Eylem |
|---|---|---|
| `CONFLICTING` | kod çatışması | rebase et / sahibine devret |
| `UNSTABLE` | zorunlu olmayan kontrol fail | **merge et** (zorunlu geçtiyse) |
| `BLOCKED` | zorunlu kontrol bekliyor | bekle, ama raporla |

## Kabul ölçütü
- Hiçbir PR 3 saatten fazla "hazır ama merge edilmemiş" kalmaz
- Çakışan PR ya rebase edilir ya devredilir — sessiz kalmaz
- Deploy kotası taşmaz
- Her merge canlıda doğrulanır

---

## Tur 1 — 2026-11-06 (lane/teslimat)

**Kapsam.** Sahip olunan 5 dosya denetlendi: `scripts/prune-vercel-deployments.mjs`,
`scripts/approve-pending-runs.mjs`, `scripts/verify-production-deployment.mjs`,
`docs/lanes/14-teslimat.md`, `docs/deploy-log.md` (yeni). Bulgular PR gövdesinde
tablo hâlinde; burada yalnızca tura özgü notlar.

**En önemli bulgu — teslim döngüsü karanlık.** `isbulkktc CI` ve
`Verify production deployment` `on: push: branches: [main]` ile tetiklenir, ama
`event=push` için en yeni run **2026-11-05T20:29Z** (`c8fe7d4e`, *insan* merge).
O saatten sonraki bütün merge'ler `app/github-actions` imzalı. Sebep
`agent-pr-automation.yml`: PR'ı `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` ile
`gh pr merge --squash --auto` çalıştırarak merge ediyor; GitHub'ın **varsayılan
Actions token'ıyla yapılan push, `push` workflow'unu tetiklemez.** Sonuç: hiçbir
otomatik merge sonrası deploy doğrulaması koşmadı. `main` ucundaki tek check'ler
*zamanlanmış* workflow'lardan (`Health check`, `Send pending push notifications`).
Çözüm INFRA'nın (PAT/App token ile merge, ve/veya verifier'a `schedule:` yedeği);
`agent:handoff` ile açıldı.

**Kendi dosyamda düzeltilen iki gerçek hata (`verify-production-deployment.mjs`).**

1. **Boş env → `NaN` deadline → sonsuz döngü.** `DEPLOY_TIMEOUT_SEC=""` iken
   `Number.parseInt("")` = `NaN`; `deadline` `NaN` olur ve `Date.now() >= NaN`
   asla true olmaz. Ölçüm: 10 sn'de **8034** "waiting" satırı (beklenen: 0–1).
   Workflow `vars.X || '900'` ile korunuyor ama script kendini savunmuyor.
   `parsePositiveInt()` eklendi.
2. **Doğrudan-çalıştırma koruması boşlukta/`#`'te sessiz no-op.** Eski koruma
   `import.meta.url === \`file://${process.argv[1]}\`` idi; yol boşluk ya da `#`
   içeriyorsa eşleşmez ve script **0 çıkış koduyla hiçbir şey doğrulamadan**
   biter. Ölçüm: `/tmp/probe lane#dir/` içinde çalıştırıldı → çıktı yok, exit 0.
   `pathToFileURL(...).href` ile düzeltildi; regresyon testi eklendi
   (`scripts/verify-production-deployment.test.mjs`, test kopyayı boşluk+`#`'li
   dizine koyup gerçekten çalıştığını doğrular).

**Kapsam dışı bırakılanlar (sahibi başka lane).** `scripts/enable-oauth-provider.mjs:102`,
`scripts/set-turnstile-secret.mjs:177`, `scripts/spawn-lanes.mjs:114` aynı bozuk
korumayı taşıyor; `scripts/lane-autopilot.mjs:563` ve `:581` `approve-pending-runs.mjs`'i
**iki kez** çağırıyor (birebir aynı blok). Hepsi LANE-INFRA'nın (`scripts/**`);
dokunulmadı, `agent:handoff` ile bildirildi.

**Ölçüm.** Kapılar: `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅,
`test:unit` **597 test / 0 fail / 4 todo**. Canlı: `main` = `f7a10fd6`, canlı =
`f7a10fd6` (senkron).

---

## Tur 2 — 2026-11-06 (lane/teslimat)

**Kapsam.** PR #307 (bu lane'in düzeltmeleri) merge edildi ve **canlı ölçüm**
yapıldı. Görev 2 (deploy sağlığı) ve görev 3 (yayın doğrulaması) uygulandı.

**Bulgu — 🔴 üretim donmuş (kabul ölçütünü doğrudan kıran tek şey).**
`main` = `c6e15b18`, canlı = `c406b397`. Canlı, `main`'in **atası** (geride,
ayrışmış değil). Aradaki iki merge (`c9d932f7` = PR #307, `c6e15b18` = PR #315)
land edildi ama üretime **çıkmadı**: ikisinin de Vercel status'ü
`Deployment rate limited — retry in 24 hours`. Son başarılı production build
`c406b397` (#314).

**Kota bekçisi çalışıyor ama yetmiyor.** `Prune Vercel deployments`
(run `42144384416`, 01:31Z) başarılı: `deleted=21 failed=0 remaining=10`. Depolama
kotası temiz; kırmızı olan **build limiti**. Yani `prune` bu tıkanıklığı açmaz —
kısıt depolama değil, build sayısı. Lane kuralı 5 gereği sınır belgelendi ve
çözüm önerileriyle **issue #319** açıldı (LANE-INFRA: `vercel.json`/deploy config,
`.github/**`). Çözümün bir parçası (plan yükseltmesi) **insan/owner** kararı.

**Merge kuyruğu (görev 1).** Açık PR'lar: #307 (bu lane, merge edildi ✅),
#250 (lane/supabase, BLOCKED — `Database` job'u **gerçek** pgTAP hatası:
`table_privileges.test.sql` test 7; sahibinin işi), #237 (lane/infra, `agent:blocked`,
dokunulmadı). `lane-collisions` temiz. #307 CI'ı tüm zorunlu kontrollerde yeşil;
`Vercel` kırmızısı zorunlu olmadığı için merge'i engellemedi (brief'teki `UNSTABLE`
durumu).

**Ölçüm.** `verify-production-deployment.mjs` canlıya karşı: 5/5 smoke route 200,
`--expect <canlı sha>` ✅. Ama `--expect <main tip>` **kırmızı** — doğru sinyal,
çünkü canlı gerçekten geride.

**Devredilenler.** #319 (üretim donmuş), #305 (push workflow'ları auto-merge'de
koşmuyor), #306 (bozuk guard ×3 + çift çağrı). Hepsi `agent:handoff`.

---

## Tur 3 — 2026-11-06 (lane/teslimat)

**Kapsam.** Sahip olunan 5 dosya yeniden denetlendi (AUDIT boyutları). Bir gerçek
hata düzeltildi, bir yapısal eksik kapatıldı, canlı ölçüm iki kez yapıldı.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/approve-pending-runs.mjs` (eski `GH_TOKEN: A ?? B`) | hata yolu / sınır girdi | `GITHUB_PERSONAL_ACCESS_TOKEN=""` (boş secret) iken `??` **düşmüyor**, boş değer geçerli `GH_TOKEN`'ı gölgeliyor; `gh` kimliksiz koşuyor | boş değer yok sayılmalı, geçerli token'a düşülmeli | Boş secret'lı ortamda script "no runs are waiting" deyip **hiçbir şey onaylamıyordu** (#178'in ta kendisi) | **düzeltildi** (`\|\|` + trim, `ghEnv()`) + regresyon testi |
| 2 | `scripts/approve-pending-runs.mjs` (tüm gövde) | yapı | `gh api` modül üstünde koşuyordu; import edilemiyordu | `main()` + `pathToFileURL` guard (kardeş script'lerde var) | Test edilemez; import gerçek onay çağrısı yapardı | **düzeltildi** |

**Kanıt (bulgu 1).** Kayıt tutan sahte `gh` ile: `GITHUB_PERSONAL_ACCESS_TOKEN="" GH_TOKEN="ghs_real"` → eski kod `GH_TOKEN=[]` geçiriyor, yeni kod `GH_TOKEN=[ghs_real]`. Gerçek `gh` ile boş token kayıtlı auth'u gölgelemiyor ama geçerli `GH_TOKEN`'ı gölgeliyordu. **Not:** "eksik token literal `undefined` olarak geçiyor" iddiası **yanlıştı** — Node `undefined` env girdisini düşürür; düzeltme yine de doğru (boş string `??`'da düşmez).

**Canlı ölçüm (görev 3).** 02:55Z: `main` = canlı = `5d026376` ✅ (donma kendiliğinden çözüldü; `--expect 5d026376` exit 0, 5/5 smoke 200). 03:08Z: `main` = `8b45b72`, canlı = `5d026376`, **5 geride** 🔴 — `a9e6b07`(#325), `77ca734`(#326), `e102567`(#330), `eae8633`(#328), `8b45b72`(#323) merge oldu, hiçbiri deploy olmadı; hepsinde `Vercel: Deployment rate limited`. Yani üretim **dalgalanıyor**: limit penceresi merge hızından kısa.

**Kota bekçisi (kural 5).** Kök neden aynı: Vercel **build** rate limiti (depolama değil — prune `deleted=21 failed=0` ile temiz). #319'a nüks kanıtı yorumu eklendi. Kalıcı çözüm: (a) plan yükseltmesi (owner), (b) her PR'da preview build'ini azaltmak — `vercel.json` `git.deploymentEnabled` veya `ignoreCommand` (LANE-INFRA, `.github/**` değil ama repo kökü).

**Merge kuyruğu (görev 1).** Açık PR'lar: #331 (lane/urun-208, BLOCKED, taze), #329/#250/#237 (UNKNOWN). #237 `.github/**` değiştiriyor → **iki fren** gereği merge edilmedi (insan). #250 `Database` = gerçek pgTAP hatası (sahibi LANE-SUPABASE). Zorunlu kontrolü geçen ve çakışmayan bir PR bu turda yoktu; `lane-collisions` temiz.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅, `test:unit` **632 test / 0 fail / 5 todo** (yeni: `scripts/approve-pending-runs.test.mjs` 4 test).

---

## Tur 4 — 2026-11-06 (lane/teslimat)

**Kapsam.** Sahip olunan 6 dosya (yeni test dosyaları dahil) AUDIT boyutlarıyla
yeniden denetlendi. İki gerçek hata düzeltildi, biri kapasite (test) eksiği
kapatıldı, canlı ölçüm yapıldı, bir bulgu LANE-INFRA'ya devredildi.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/verify-production-deployment.mjs` (eski `main()` `vercel` init) | hata yolu / doğruluk | `VERCEL_TOKEN` **set ama geçersiz** iken `configured:false`, reason `VERCEL_TOKEN not set` | sağlanan token "set" sayılmalı; neden gerçek sebep olmalı | Operatöre zaten set ettiği secret'ı "set et" deniyor; `decideVerification` "blocked + unconfigured" dalını yanlış kullanıyor | **düzeltildi** (`initialVercelState()` + regresyon testi) |
| 2 | `scripts/prune-vercel-deployments.mjs` (yok) | kapasite / test | Üretim deployment'ını **silen** karar fonksiyonunun hiç testi yok | Sınır davranışı pinlenmeli | Canlıyı silme hatası sessizce geçebilir | **düzeltildi** — 8 test eklendi |
| 3 | `scripts/prune-vercel-deployments.mjs:91` | hata yolu | `fetch`'te timeout yok, workflow'da `timeout-minutes` yok | istek sınırlanmalı | Takılan bağlantı 6 saatlik job limitine kadar döner; prune durunca backlog geri büyür | **düzeltildi** (20s `AbortSignal.timeout` → 599, retry'a girer) |
| 4 | `scripts/lane-autopilot.mjs:563,581` | ölü kod | Aynı onay bloğu **iki kez** (yorum dahil birebir) | tek çağrı | `gh` trafiği ikiye katlanıyor (#218 hedefi) | **devredildi** — LANE-INFRA |
| 5 | `scripts/approve-pending-runs.mjs`, `verify-production-deployment.mjs`, `docs/deploy-log.md`, `docs/lanes/14-teslimat.md` | tüm boyutlar | Tur 3'te denetlendi, bu turda regresyon yok | — | — | ✅ bakıldı, sorun yok |

**Bakılmayan dosya yok** — sahip olunan 6 dosyanın hepsi tarandı.

**Kanıt (bulgu 1).** `VERCEL_TOKEN=invalid_token_xyz DEPLOY_TIMEOUT_SEC=1 node scripts/verify-production-deployment.mjs --expect 5b1923d0` → **eski**: `Vercel API: ⏭️ VERCEL_TOKEN not set`. **yeni**: `Vercel API: ❌ Vercel API unreachable: no team with slug "orijin1"`. Doğru sınıflandırma: token sağlanmış (`configured:true`), sorun erişilebilirlikte.

**Canlı ölçüm (görev 3).** 03:48Z: `main`=`9ea1aaf`, canlı=`5b1923d0` (2 geride, donma sürüyor). 04:50Z: `main` = canlı = `1b1bf26` ✅ — limit penceresi yine açıldı, backlog deploy oldu (commit status `Vercel: success`). Günün **üçüncü** donma→toparlanma döngüsü; #319'un tarif ettiği salınım kararlı durum.

**Kota bekçisi (kural 5).** Kök neden değişmedi: Vercel **build** rate limiti. Yeni kanıt: bu PR'ın kendi preview build'i de `Deployment rate limited` aldı → PR `mergeStateStatus: UNSTABLE` (zorunlu CI yeşil). Kalıcı çözüm seçenekleri #319'da; bu lane'in yapabileceği kısım `prune`'un sağlamlığı (bulgu 2–3).

**Merge kuyruğu (görev 1).** Açık PR'lar taze (hepsi <30 dk) ve hepsinde zorunlu `Quality, database and E2E` hâlâ koşuyor; #250 zorunlu `Database`'te gerçek pgTAP hatasıyla duruyor (auto-merge açık, doğru davranış). Bu turda merge edilebilir durumda bekleyen PR yoktu.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅, `test:unit` **650 test / 645 pass / 0 fail / 5 todo** (yeni: `prune-vercel-deployments.test.mjs` 8 test, `verify-production-deployment.test.mjs` +1).

---

## Tur 5 — 2026-11-09 (lane/teslimat)

**Kapsam.** Atanmış açık issue **#427** (`lane:teslimat` + `agent:handoff`, LANE-OPERATÖR'ün
PR #425 mikro-denetiminden) alındı: `verify-production-deployment` `main` ilerlediğinde
kırmızı düşüyordu. Kanıt doğrulandı, kök neden düzeltildi, regresyon testleri eklendi,
canlı ölçüm yapıldı.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/verify-production-deployment.mjs` (eski `isSuperseded` çağrısı tek seferlik) | mantık / doğruluk | `--tip` workflow tarafından **başta bir kez** okunuyor; script 900 sn poll ediyor. Poll sürerken `main`'e merge düşerse `expected` artık tip değildir ama `isSuperseded` bunu göremez | poll döngüsünde tip tazelenmeli, yeni commit `main`i aldıysa koşu **atlamalı** | `main`'de kalıcı kırmızı gürültü (son 5 koşunun 3'ü kırmızı); operatörün sağlık kapısı her merge sonrası sahte alarm veriyor | **düzeltildi** (#427) + 3 regresyon testi |
| 2 | `scripts/verify-production-deployment.mjs` (yeni `readRemoteTip`) | hata yolu / sınır girdi | `git ls-remote` çağrısı sınırsızdı; diğer bütün istekler `REQUEST_TIMEOUT_MS` ile sınırlı | çağrı da sınırlanmalı | Takılan bağlantı poll döngüsünü deadline'ın ötesine asabilir | **düzeltildi** (`timeout` + `SIGKILL`) |
| 3 | `scripts/verify-production-deployment.mjs` (yeni `trackTip`) | sınır girdi / yapı | Workflow'un ilk `ls-remote`'u düşerse `--tip` boş kalır ve superseded-atlama sessizce kapanır | push koşusunda tip yine izlenmeli | Boş `--tip` ile #427'nin ta kendisi geri gelir | **düzeltildi** (`GITHUB_EVENT_NAME === "push"`) + 2 test |

**Kanıt (bulgu 1).** Sahte `git` ile: `--expect 1111… --tip 1111…` (ikisi de aynı, yani
baştaki kontrol ateşlemez) ve uzak tip `2222…` → **eski** script: deadline'a kadar poll
edip `FAIL` (exit 1); **yeni** script: `skipped: 11111111 was superseded by 22222222`
(exit 0). Regresyon testi eski script'e karşı **kırmızı**, yeni script'e karşı yeşil —
yani test gerçekten hatayı pinliyor (stash ile doğrulandı).

**Değişmez sözleşme korundu.** `workflow_dispatch` (`--tip` yok) manuel koşuda commit'i
adıyla doğrular; canlı tip okuması yapmaz, superseded diye atlamaz. Bu, test 6 ile
pinlendi (exit 1, `FAIL`, `superseded` yok).

**Canlı ölçüm (görev 3).** 23:25Z: `main` = canlı = `bc767871` ✅. 23:38Z: `main` =
canlı = `a1419963` ✅ (bu lane çalışırken bir merge düştü — #427'nin senaryosunun
gerçek olduğunun kanıtı). Tam koşu `--expect a1419963` → exit 0, HTTP kanalı **ulaşılabilir**
(Cloudflare bu kez 403 vermedi), 5/5 smoke route 200.

**Merge kuyruğu (görev 1).** Açık PR'lar: #493 (lane/infra, `CLEAN`, tüm zorunlu
kontroller yeşil) — **ama `.github/workflows/ci.yml` değiştiriyor → "iki fren" gereği
merge edilmedi (insan)**. #501 (lane/icerik, `BLOCKED`, E2E 1/4 hâlâ koşuyor).

**Teslim edildi.** PR **#503** (bu düzeltme) tüm zorunlu kontroller yeşilken
`app/github-actions` auto-merge ile **23:44:29Z'de merge edildi** (`main` =
`713d8fe`). Canlı doğrulama: `--expect 713d8fe` → exit 0, HTTP kanalı, 5/5 smoke
route 200. Merge kaydı `docs/deploy-log.md`'de (kural 4).

**Not (kapsam dışı, LANE-INFRA sahibi).** Bu merge'i de yapan bot push'u
`verify-production-deployment` workflow'unu **tetiklemedi** (varsayılan Actions
token'ı ile push → `push` event yok; son `push` koşusu 15:54Z). Bu boşluk Tur 1'de
zaten INFRA'ya devredildi; #427 düzeltmesi bu boşluğu kapatmaz, yalnız *koşan*
işin yanlış kırmızıya düşmesini engeller.

**Kapılar (rebase sonrası, `a141996` üzerine).** `lint` ✅, `typecheck` ✅,
`check:frontend-source` ✅, `test:unit` **894 test / 892 pass / 0 fail / 2 todo**
(yeni: `verify-production-deployment.test.mjs` +5 test → toplam 9).

---

## Tur 6 — 2026-11-10 (lane/teslimat)

**Kapsam.** #427 kapalı ve düzeltmesi `main`'de (PR #503, `713d8fe`). Açık
`lane:teslimat` issue yok. Bu tur: sahip olunan dosyaların denetimi (AUDIT
boyutları), bir gerçek hata düzeltmesi, canlı doğrulama, merge kaydı.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/approve-pending-runs.mjs` (liste çağrısı) | hata yolu / sınır girdi | `per_page=50`, `--paginate` yok → API varsayılanı yalnız **ilk sayfayı** döndürür | tüm sayfalar okunmalı | Bir sayfadan büyük `action_required` birikimi **kısmen** onaylanır ama script `approved N/N` deyip exit 0 verir — #178'in (kimsenin izlemediği kuyruk) tam da kendisi | **düzeltildi** (`--paginate`) + `parsePendingRuns()` + 3 test |

**Kanıt (bulgu 1).** `--paginate` bayrağını tek başına kaldırıp testleri koştum:
`the list call paginates…` ve `every pending run…` **kırmızı** (2 fail / 6 pass);
bayrak geri gelince 8/8 yeşil. Yani testler gerçekten eksikliği pinliyor. Bugün
`action_required` `total_count` = 0 olduğundan latent; ama sessizce yarım
temizlenmiş kuyruk olarak tezahür eder, bu yüzden doğruluk boşluğu.

**Canlı ölçüm (görev 3).** 00:15Z: `main` = canlı = `8f4a50e3` ✅. Tam koşu
`--expect 8f4a50e3` → exit 0, HTTP kanalı ulaşılabilir, 5/5 smoke route 200.
Bu turda `main` iki kez ilerledi (`713d8fe` → `1101321` #504 → `8f4a50e3` #507) ve
üretim ikisini de takip etti — **donma yok** (#319 bu turda nüks etmedi).

**Merge kuyruğu (görev 1).** Açık PR: yalnız **#493** (lane/infra). Zorunlu
kontroller (`Quality, database and E2E`, Static, Database, E2E 1–4) **hepsi yeşil**,
`CLEAN`/`MERGEABLE` — **ama `.github/workflows/ci.yml` değiştiriyor → "iki fren"
gereği merge edilmedi (insan).** Doğru davranış; not olarak bırakıldı.

**Devredilenler (sahibi başka lane).** #306 (bozuk guard ×3 + çift onay bloğu),
#305 (push workflow'ları auto-merge'de koşmuyor), #319 (Vercel build rate limit)
hâlâ açık ve LANE-INFRA'nın; bu lane yalnız kendi dosyasındaki sayfalama
boşluğunu kapattı, #306'nın geri kalanına dokunmadı.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅, `test:unit`
**898 test / 896 pass / 0 fail / 2 todo** (yeni: `approve-pending-runs.test.mjs`
+3 test → toplam 8).

**Merge (kural 4).** PR **#509** `app/github-actions` tarafından 00:26:53Z'de
otomatik merge edildi (`ci.yml` değiştirmediği için "iki fren" engellemedi); tüm
zorunlu kontroller yeşil (aggregator dahil). `main` `8f4a50e3` → `3fcafbf3`.

**Canlı teyit (görev 3, merge sonrası).** 00:30Z: `main` = canlı = `3fcafbf3` ✅.
Tam koşu `--expect 3fcafbf` → exit 0, HTTP kanalı ulaşılabilir, 5/5 smoke route
200. Üretim merge'i anında takip etti — **donma yok**.
