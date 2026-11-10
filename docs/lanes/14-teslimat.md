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

---

## Tur 7 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok. Bu tur: sahip olunan
`verify-production-deployment.mjs`'te bir gerçek hata düzeltildi (finding 15),
PR merge edildi, canlı ölçüm yapıldı — ama üretim **kapalı** olduğu için teslim
canlıda doğrulanamadı.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/verify-production-deployment.mjs` (`decideVerification`, eski `if (vercel.ok)` önce) | doğruluk / hata yolu | Vercel hesabı bloklu iken origin **402 `DEPLOYMENT_DISABLED`** döner; alias hâlâ `READY` bir deployment'a işaret edebilir. Eski sıralama önce `vercel.ok`'a bakıp **✅ yeşil** veriyordu | devre dışı deployment her sinyalin **üstünde** olmalı | Runner edge-blocked (403) olduğunda tüm smoke route'lar *atlanır* → eski script **exit 0** = sahte yeşil, hem de site herkese kapalıyken | **düzeltildi** (#522) + 5 regresyon testi |

**Kanıt (bulgu 1).** Sahte `fetch` (sağlıklı Vercel alias + origin 402 + runner 403):
**eski** → `verdict: ✅ alias built from 8d3db245`, `smoke routes: ⏭️ skipped`,
**exit 0**. **yeni** → `❌ production deployment is disabled (not a code problem)`,
**exit 1**. Ayrıca canlı ölçüm: `DEPLOY_TIMEOUT_SEC=45` ile eski script **61 s** poll
edip 3 `waiting` satırı yazdı, yeni script **<1 s**'de döndü (0 satır). Yeşil-maskeleme
testi eski sıralamaya karşı kırmızı — testi gerçekten hatayı pinliyor.

**Merge kuyruğu (görev 1).** Açık PR'lar: #520 (cloudflare, BLOCKED), #519
(guvenlik, BLOCKED), #517 (operator, BLOCKED), #493 (infra, `CLEAN` ama
`.github/workflows/ci.yml` değiştiriyor → **"iki fren" gereği merge edilmedi,
insan**). Bu turda zorunlu kontrolü geçip çakışmayan, kendi PR'ım dışında merge
edilebilir PR yoktu.

**Teslim edildi.** PR **#522** `app/github-actions` auto-merge ile
02:39:29Z'de **merge edildi** (`main` `2a78026` → `1599b14a`); tüm zorunlu
kontroller yeşil (aggregator dahil), tek kırmızı `Vercel — Account is blocked.`
(zorunlu değil → brief'in `UNSTABLE` durumu). Merge kaydı `docs/deploy-log.md`'de.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı.** 02:40Z: `main` = `1599b14a`,
canlı = **402 her route'ta** (`/`, `/jobs`, `/companies`, `/contact`, `/en`).
`--expect 1599b14a` → exit 1, yeni "production deployment is disabled" verdict'i.
Bu, üretimin herkese kapalı olduğu anlamına gelir; sebep **hesap durumu** (Vercel
block, commit status `Vercel: failure — Account is blocked.`), kod hatası değil ve
bu depodan düzeltilemez. **#319** (`lane:infra`) kapsamında; bu lane dokunmaz.
Bu turun tek doğrulanamayan merge'i budur ve sebebi dışsaldır — gizlenmedi, adı kondu.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅, `test:unit`
**911 test / 909 pass / 0 fail / 2 todo** (yeni: `verify-production-deployment.test.mjs`
+5 test → toplam 14).

---

## Tur 8 — 2026-11-10 (lane/teslimat)

**Kapsam.** Açık `lane:teslimat` issue yok. Bu tur: sahip olunan
`scripts/approve-pending-runs.mjs`'te iki gerçek hata düzeltildi (finding 16–17),
tüm statik kapılar yeşile getirildi, canlı ölçüm yapıldı. Üretim hâlâ **kapalı**
olduğu için hiçbir merge canlıda doğrulanamadı.

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/approve-pending-runs.mjs` (onay `catch` + dönüş) | hata yolu / mantık | Bir run onaylanamazsa hata yazdırılıyor ama script yine `approved N/M` deyip **exit 0** veriyordu | onaylanamayan run "kuyruk temiz" sayılmamalı | Zamanlanmış çağıran (`lane-autopilot`) exit kodunu "kuyruk temiz" diye okur; `action_required`'da kalan bir run — CI'sız BLOCKED bir lane — başarı gibi görünür. **#178'in ta kendisi** | **düzeltildi** — `failed` sayacı, stderr'e "still need approval" satırı, exit 1 + regresyon testi |
| 2 | `scripts/approve-pending-runs.mjs` (onay catch + üst düzey `main().catch`) | hata yolu | `execFileSync` hatasında yalnız `error.message` (`Command failed: gh api …`) yazdırılıyordu | asıl sebep (`stderr`) gösterilmeli | Operatör "Resource not accessible by integration" gibi eyleme dönük satırı göremiyor; log hiçbir şey söylemiyor | **düzeltildi** — `ghErrorLine()` (stderr ilk dolu satır, yoksa message) + test |

**Kanıt (bulgu 1).** Sahte `gh` (liste OK, onay reddi + stderr) ile gerçek script
koşturuldu: **eski** → `approved 0/1`, **exit 0**; **yeni** → `1 run(s) still need
approval; the queue is not clear`, **exit 1**. Regresyon testi eski script'e karşı
kırmızı — hatayı gerçekten pinliyor.

**Kanıt (bulgu 2).** `ghErrorLine(new Error("Command failed: …", {stderr:"gh: Resource not accessible by integration"}))`
→ `"gh: Resource not accessible by integration"`; stderr yoksa `message`'a düşer.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı.** 03:09Z: `main` = `df36b2d1`.
Her route (`/`, `/jobs`, `/companies`, `/contact`, `/en`, `/tr`, `/login`,
`/api/build-info`) **402** + `x-vercel-error: DEPLOYMENT_DISABLED`. Sebep **hesap
durumu** (#319 / issue #518, LANE-INFRA), kod hatası değil, bu depodan
düzeltilemez. `main`↔canlı karşılaştırması yapılamıyor.

**Merge kuyruğu (görev 1).** Açık PR'lar: #526 (lane/guvenlik, `BLOCKED`),
#493 (lane/infra, `CLEAN` ama `.github/workflows/ci.yml` değiştiriyor →
**"iki fren" gereği merge edilmedi, insan**). Bu turda bu lane'in merge
edebileceği PR yoktu.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅, `test:unit`
**920 test / 918 pass / 0 fail / 2 todo** (yeni: `approve-pending-runs.test.mjs`
+2 test → toplam 10).

**Teslim edildi (kural 4).** PR **#527** `app/github-actions` auto-merge (squash)
ile **03:20:21Z'de merge edildi** (`main` `df36b2d1` → `feb5ee0d`); tüm zorunlu
kontroller yeşil (aggregator dahil), tek kırmızı `Vercel — Account is blocked.`
(zorunlu değil → `UNSTABLE`). Canlı doğrulama **yapılamadı**: her route hâlâ
**402** (`DEPLOYMENT_DISABLED`) — hesap bloğu (#319 / #518) sürüyor. Merge kaydı
`docs/deploy-log.md`'de.

---

## Tur 9 — 2026-11-10 (lane/teslimat)

**Kapsam.** Açık `lane:teslimat` issue yok. Bu tur: sahip olunan
`verify-production-deployment.mjs`'te bir gerçek hata düzeltildi (finding 20),
PR merge edildi, canlı ölçüm yapıldı — **ama üretim dondurulmuş** olduğu için
merge canlıda doğrulanamadı ve neden tahmin edilmedi, adı kondu (finding 21).

**Bulgular.**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `scripts/verify-production-deployment.mjs` (`if (!decision.verified)` `else` bloğu) | mantık / hata yolu | Smoke bloğu yalnız **yeşil** verdict'te koşuyordu; commit kontrolü kırmızıyken origin hiç problanmıyordu | Tazelik ile sağlık **ayrı sorular**; origin cevap veriyorsa smoke koşmalı | `main` geride ama site ayakta (bu repoda **normal** durum, #319/#547) ile "geride **ve** bozuk" ayırt edilemiyordu; kırmızı koşu sağlık kanalını tamamen düşürüyordu | **düzeltildi** (#570) + regresyon testi |

**Kanıt (bulgu 1).** Aynı komut, düzeltme öncesi/sonrası, canlı `3644cbe3`'e karşı
`--expect e6d1345`: **eski** → `verdict: ❌ … serving 3644cbe3, expected e6d1345`,
**hiç `smoke routes` satırı yok**. **yeni** → aynı kırmızı verdict **+**
`smoke routes: ✅ 5 passed, 0 skipped, 0 failed` (beş route da 200). Çıkış kodu
ikisinde de `1` → değişiklik **tamamen eklemeli**: yeşil koşuda kapı aynı, kırmızı
koşuda düşen bir route zaten-kırmızı verdict'e yalnız detay ekler. Devre dışı
deployment (`402`/`404`) her zaman `verified:false` **ve** `http.disabled:true`
zorladığından, atlanması gereken tek durum (site herkese kapalı) yine atlanır.

**Merge kuyruğu (görev 1).** Açık PR'lar: #566 (lane/supabase, `CLEAN`, zorunlu
kontroller yeşil) — bu turda `app/github-actions` auto-merge ile **11:38:52Z'de
merge edildi** (`main` `e6d1345` → `d5f19bc`); #569 (lane/qa) ve #567 (lane/urun)
`BLOCKED`. Hiçbiri `.github/workflows/**` değiştirmiyor, `agent:hold` yok → "iki
fren" tetiklenmedi. Bu lane'in merge edebileceği, taze ve yeşil tek PR #566'ydı ve
zaten auto-merge kuyruğundaydı.

**Teslim edildi (kural 4).** PR **#570** `app/github-actions` auto-merge (squash)
ile **11:44:04Z'de merge edildi** (`main` `e6d1345` → `f7b3196` → `1adde86`); tüm
zorunlu kontroller yeşil (Static 1m06s, Database 2m00s, E2E 1–4 pass, aggregator
dahil). Merge kaydı `docs/deploy-log.md`'de.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.**
`main` = `1adde86`, canlı = `3644cbe3` (**14 geride**). Bu, #319'un build-rate-limit
salınımı **değil** — o imza `Vercel: Deployment rate limited` kırmızısı bırakır ve
saatler içinde kendiliğinden açılır. Burada son commit'lerde **hiç `Vercel` status
girdisi yok** (`total_count: 0`) → **#547** durumu: yeni Vercel hesabında GitHub Git
bağlantısı yok, `main` push'u build tetiklemiyor. Ayırt edici: rate-limit bir durum
*state*'i bırakır, eksik entegrasyon hiçbir şey bırakmaz. Bu, depodan düzeltilemez;
sahip tarafı (Vercel Dashboard → Git) veya LANE-INFRA `VERCEL_TOKEN` deploy
workflow'u — ikisi de #547'de kapsanmış. Bu turun tek doğrulanamayan merge'i budur ve
sebebi dışsaldır; gizlenmedi, adı kondu.

**Devredilenler (sahibi başka lane).** #547 (`agent:infra` + `agent:blocked`; teslim
donmasının kök nedeni) bu lane'in sahibi olmadığı bir Vercel/Actions ayarı — yeni
kanıtla (14 geride, `total_count: 0`) tazelendi. #305 (auto-merge'de push
workflow'ları koşmuyor), #306 (bozuk guard + çift onay bloğu) hâlâ açık ve
LANE-INFRA'nın; bu lane dokunmadı.

**Kapılar.** `lint` ✅, `typecheck` ✅, `check:frontend-source` ✅ (41 token, 16
sektör görseli), `test:unit` ✅ (bu turun değişikliği CI'da tüm shard'larda yeşil).


---

## Tur 10 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok. Kurtarma turu: alan taranmadı,
tek sınırlı düzeltme — Tur 9'un merge kaydının (kural 4) eksik kalan tamamlanması
(finding 22 + deploy-log satırı).

**Neden bu iş gerçek.** Tur 9'un PR'ı (#570) `docs/deploy-log.md`'ye merge satırını
yazmıştı ama bu lane'in *kendi* PR'ı (#574) **hiç kaydedilmemişti**: deploy-log'un
son satırı #570'di (`1adde86`). Kural 4 — "her merge kaydedilir: ne, ne zaman,
canlıda doğrulandı mı" — bu merge için ihlal edilmiş durumdaydı. Bu tur onu kapatır.

**Bulgu (finding 22) — `approve-pending-runs.mjs` `gh` çağrıları sınırsızdı.**
Script `lane-autopilot.mjs` tarafından `execFileSync` ile, kendi timeout'u olmadan
çağrılıyor; workflow'da `timeout-minutes` da yok. Takılan bir `gh` (asılı bağlantı,
etkileşimli auth prompt'u) **altı saatlik job tavanına** kadar zamanlanmış lane
geçişini bloke ediyordu — ne kısmi ilerleme ne hata sinyali. Kardeş lane
script'lerinde bu sınır var; bunda yoktu. Düzeltme: `ghTimeoutMs(source=process.env)`
(varsayılan `60_000`, `GH_TIMEOUT_MS` ile geçersiz kılınır; boş/≤0 → varsayılan) her
`execFileSync('gh', …)` çağrısına `killSignal:'SIGKILL'` ile geçiriliyor; timeout
mevcut hata yoluna (finding 16) düşüp **sayılıyor** — yani script asılmak yerine
raporluyor. Regresyon testleri `scripts/approve-pending-runs.test.mjs`'te.

**Teslim edildi (kural 4).** PR **#574** `app/github-actions` auto-merge (squash) ile
**12:14:09Z'de merge edildi** (`main` `1adde86` → `83d7f3e`); tüm zorunlu kontroller
yeşil (aggregator dahil). Kayıt bu turda `docs/deploy-log.md`'ye eklendi.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.** 12:17Z:
`main` = `83d7f3e`, canlı = `3644cbe3` (**19 geride**). `GET /` **200** (stale but
healthy). Tip `83d7f3e`'de **hiç `Vercel` status girdisi yok** (`total_count: 0`) →
**#547** durumu (yeni Vercel hesabında GitHub Git bağlantısı yok), #319 rate-limit
salınımı **değil**. Depodan düzeltilemez; sahip tarafı (Vercel Dashboard → Git) veya
LANE-INFRA `VERCEL_TOKEN` workflow'u. Bu lane'in dördüncü doğrulanamayan teslimi ve
sebebi dışsaldır.

**Merge kuyruğu (görev 1).** Bu turda açık PR yok (`gh pr list --state open` boş) —
diğer lane'lerin PR'ları bu arada auto-merge ile inmiş (`955a82f` #571, `4144425`
#572, `5214294` #567, `9da8c57` #573). Bu lane'in merge edebileceği bekleyen PR yoktu.

**Devredilenler.** #547 (teslim donmasının kök nedeni, `agent:infra` + `agent:blocked`)
yeni kanıtla (19 geride, `total_count: 0`) hâlâ geçerli; bu lane dokunmadı.

---

## Tur 11 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok. Kurtarma turu: alan taranmadı,
tek sınırlı düzeltme — Tur 10'un kapattığı kural 4 boşluğu **bir kez daha** açılmıştı
(PR #575, #576 ve #577 kaydedilmemiş) ve bu tur onu kapatır.

**Neden bu iş gerçek.** Tur 10, PR #574'ün kaydını yazarken `docs/deploy-log.md`'nin
son satırı #570'ti; aynı boşluk şimdi **üç merge** için tekrarlandı: #574'ten sonra
inen #575 (infra), #576 (bu lane'in kendi kural-4 kaydı) ve #577 (tasarim) için
deploy-log'da **hiç satır yoktu**. Kural 4 — "her merge kaydedilir: ne, ne zaman,
canlıda doğrulandı mı" — üçü için de ihlal edilmiş durumdaydı. Özellikle #576: bu
lane'in *kendi* kayıt PR'ının kaydı yoktu, yani boşluk kendi çıktısını da yutuyordu.

**Yöntem — sıra timestamp'ten değil zincirden okunur.** GitHub `mergedAt` değerleri
(#576 12:32:06Z, #575 12:32:18Z, #577 12:34:46Z) `main`'in **first-parent** zinciriyle
karşılaştırıldı: `83d7f3e` (#574) → `acbbeba` (#576) → `837d581` (#575) → `f2a1a1c`
(#577). 12 saniyelik pencere yarış durumudur; timestamp sıralamasına güvenmek yerine
zincir kaynak alındı — üç değerin de tutarlı olduğu tek sıra bu.

**Bulgu (finding 23) — kayıt boşluğu tekrarı.** Kural 4, merge ile kayıt arasına
bir eşik koymuyor; bu yüzden her turda "kendi merge'ümü yazdım" yetmiyor: **arada
inen başka lane merge'leri de** yazılmalı. Tur 10 ve Tur 11 aynı boşluğun iki
örneğidir. Bu tur #575–#577 için tek satırda üç kaydı kapatır.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.** 12:37Z:
`main` = `f2a1a1c`, canlı = `3644cbe3` (**22 geride**). Beş smoke route (`/`, `/jobs`,
`/companies`, `/contact`, `/en`) **200** → stale-but-healthy. Tip `f2a1a1c`'de **hiç
`Vercel` status girdisi yok** (`total_count: 0`) → **#547** durumu (yeni Vercel
hesabında GitHub Git bağlantısı yok), #319 rate-limit salınımı **değil**. Depodan
düzeltilemez; sahip tarafı (Vercel Dashboard → Git) veya LANE-INFRA `VERCEL_TOKEN`
workflow'u. Bu lane'in beşinci doğrulanamayan teslimi ve sebebi dışsaldır.

**Merge kuyruğu (görev 1).** `gh pr list --state open` bu turda **boş** — merge
edilebilir bekleyen PR yok. #575/#576/#577 bu lane'in oturumu açılmadan az önce
auto-merge ile inmişti.

**Devredilenler.** #547 (teslim donmasının kök nedeni, `agent:infra` +
`agent:blocked`) yeni kanıtla (22 geride, `total_count: 0`) hâlâ geçerli; bu lane
dokunmadı.


---

## Tur 12 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok; açık PR yok. Kurtarma turu: alan
taranmadı, tek sınırlı düzeltme — kural 4'ün **kendi kayıt PR'ını yine yutması**
(finding 23). PR #578 (`docs(teslimat)`, Tur 11'in kural-4 kaydı) merge edildi ama
`docs/deploy-log.md`'de **hiç satırı yoktu**: deploy-log'un son kaydı #575/#576/#577
satırıydı (12:37Z). Bu tur onu kapatır.

**Neden bu iş gerçek.** Kural 4 — "her merge kaydedilir: ne, ne zaman, canlıda
doğrulandı mı" — #578 için ihlal edilmiş durumdaydı. Bu, **üçüncü tekrar**: Tur 10
#574'ün kaydını yazarken aynı boşluk, Tur 11 #575–#577 için, şimdi #578 için. Boşluk
kendi kendini besliyor: bir kayıt PR'ı merge olduğunda onu yazan el ondan sonra
durduğu için, kayıt PR'ının kendi kaydı hep bir sonraki tura kalıyor. Kayıt
zincirinde bir tane eksik halka varsa zincir kopar.

**Bulgu (finding 23) — kayıt boşluğu üçüncü kez.** Kural 4, merge ile kayıt arasına
bir eşik koymuyor ve kayıt *kendi PR'ını* kapsamıyor. Tur 10/11/12 aynı boşluğun üç
örneğidir; bu tur #578 için tek satırla kapatır.

**Teslim edildi (kural 4).** PR **#578** `app/github-actions` auto-merge (squash) ile
**12:50:41Z'de merge edildi** (`main` `f2a1a1c` → `b39718d`, merge commit
`b39718d35f69dcaf82590ac9a368649e0f258936`); tüm zorunlu kontroller yeşil. Kayıt bu
turda `docs/deploy-log.md`'ye eklendi.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.** 13:00Z:
`main` = `b39718d`, canlı = `3644cbe3` (**23 geride**, ve `3644cbe3` `main`'in
atası — ayrışmış değil). `GET /` **200**, `GET /api/build-info` → `3644cbe3` → **stale
but healthy**. Tip `b39718d`'de **hiç `Vercel` status girdisi yok** (`total_count: 0`)
→ **#547** durumu (yeni Vercel hesabında GitHub Git bağlantısı yok), #319 rate-limit
salınımı **değil**. Depodan düzeltilemez; sahip tarafı (Vercel Dashboard → Git) veya
LANE-INFRA `VERCEL_TOKEN` deploy workflow'u. Bu lane'in altıncı doğrulanamayan
teslimi ve sebebi dışsaldır.

**Merge kuyruğu (görev 1).** `gh pr list --state open` bu turda **boş** — merge
edilebilir bekleyen PR yok.

**Devredilenler.** #547 (teslim donmasının kök nedeni, `agent:infra` +
`agent:blocked`) yeni kanıtla (23 geride, `total_count: 0`) hâlâ geçerli; bu lane
dokunmadı.


## Tur 13 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok. Kurtarma turu: alan taranmadı;
tek sınırlı, gerçek bir düzeltme — PR #580'i kilitlenmekten kurtarıp merge etmek ve
kural 4 kaydını yazmak.

**Bulgu (finding 24) — deploy doğrulayıcının başlığı kendi exit koduyla çelişebiliyordu.**
`scripts/verify-production-deployment.mjs` özetin `verdict:` satırını yalnız
`decision.verified`'dan (tazelik) türetiyordu; `process.exitCode` ise hem tazelik hem
smoke-rota hatasını taşıyan `failures` dizisinden geliyordu. Sonuç: commit onaylanmış
ama bir public rota 500 dönüyorsa çıktı `verdict: ✅ commit confirmed …` yazıp iş
**exit 1** ile kırmızı bitiyordu — insanın ilk okuduğu satırda sahte yeşil. Tek doğruluk
kaynağıyla düzeltildi: `describeVerdict(decision, routeFailures)` hem başlığı hem exit
kararını besler; artık yapısal olarak ayrışamazlar.

**Bulgu (finding 25) — lane'e ait bir test, *blocked* bir PR ile aynı dosyayı paylaşınca
ikisi birden kilitleniyor.** #580'in regresyon testi, #579'un (`lane/infra`,
`agent:blocked` — insan-only, kendi kendine iyileşemez) düzenlediği
`scripts/verify-production-deployment.test.mjs` içindeydi. `Lane collisions` kapısı iki
PR'ı aynı dosyada görünce #580'in Static checks'i kırmızıya döndü ve #580, hareket
edemeyen bir PR'ın arkasında `BLOCKED` kaldı. Çözüm lane'in kendi glob'unda kaldı:
regresyon testi **yeni** bir dosyaya (`scripts/verify-production-deployment-verdict.test.mjs`,
`scripts/verify-production-deployment*.mjs` glob'una girer) taşındı, ortak dosya
`origin/main`'e birebir geri döndürüldü (diff'ten tamamen çıktı).
`node scripts/lane-collisions.mjs --pr 580` → `No collisions across 2 open PR(s)`.

**Teslim edildi (kural 4).** PR **#580** `app/github-actions` auto-merge (squash) ile
**13:40:16Z'de merge edildi** (`main` `b39718d` → `1c103de`, merge commit
`1c103decd3178cb80c29f00b629c161503766832`); tüm zorunlu kontroller yeşil (Static 1m11s,
Database 2m05s, E2E 1–4 pass, `Quality, database and E2E` aggregator pass). Kayıt bu
turda `docs/deploy-log.md`'ye eklendi.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.** 13:40Z:
`main` = `1c103de`, canlı = `3644cbe3` (**24 geride**, ve `3644cbe3` `main`'in atası —
ayrışmış değil). `GET /` **200** → **stale but healthy**. Tip `1c103de`'de **hiç `Vercel`
status girdisi yok** (`total_count: 0`) → **#547** durumu (yeni Vercel hesabında GitHub
Git bağlantısı yok), #319 rate-limit salınımı **değil**. Depodan düzeltilemez; sahip
tarafı (Vercel Dashboard → Git) veya LANE-INFRA `VERCEL_TOKEN` deploy workflow'u. Bu
lane'in yedinci doğrulanamayan teslimi ve sebebi dışsaldır.

**Merge kuyruğu (görev 1).** Bu turda merge edilebilir tek PR #580'di (bu lane'in);
merge edildi. Kalan açık PR #579 (`lane/infra`, `agent:blocked`) workflow dosyası
değiştirdiği ve insan-onayı beklediği için bu lane'in kapsamı dışında.

**Devredilenler.** #547 (teslim donmasının kök nedeni, `agent:infra` + `agent:blocked`)
yeni kanıtla (24 geride, `total_count: 0`) hâlâ geçerli; bu lane dokunmadı.

---

## Tur 14 — 2026-11-10 (lane/teslimat)

**Kapsam.** Atanmış açık `lane:teslimat` issue yok. Kurtarma turu: alan taranmadı;
tek sınırlı gerçek düzeltme (finding 26, kendi dosyam) + kural 4 kaydı (#581/#582).

**Bulgu (finding 26) — `prune-vercel-deployments.mjs` gövde-okuma iptali tüm koşuyu
hâlâ düşürebiliyordu, kendi timeout'unu boşa çıkararak.** `apiRequest` `fetch`
çağrısını try/catch ile koruyup timeout'u `599` sentinel'ine çeviriyordu — ama
`await response.text()` bu try'ın **dışında** koşuyordu. Gövde okuması da aynı
`AbortSignal.timeout(REQUEST_TIMEOUT_MS)` kapsamındadır; bu yüzden takılan ya da
yarıda kesilen bir yanıt, korumanın **ardından** `TimeoutError` atıyor, o throw
`apiRequestWithRetry`'den (yalnız döndürülen `{ status }` değerini yeniden dener)
kaçıyor ve **tüm prune koşusunu** iptal ediyordu. Bu, mevcut yorumun amacının tam
tersi ("retry it like any other transient failure instead of the whole run
crashing on it"): istek yolu korumalıydı, gövde yolu değildi. Kanıt: `text()`
`TimeoutError` ile reddeden sahte `fetch` → **eski** kod `THREW: TimeoutError`,
**yeni** kod `{ status: 599 }` döndürüp retry döngüsüne giriyor. Düzeltme: okuma
try'ın içine alındı (`apiRequest` de test edilebilsin diye export edildi).
Regresyon testi: `scripts/prune-vercel-deployments-request.test.mjs` (5 vaka).

**Teslim edildi (kural 4).** PR **#581** ve **#582** için deploy-log'a satır
eklendi (Tur 11'den sonra inen iki merge kaydedilmemişti; #581 bu lane'in *kendi*
kayıt PR'ıydı — finding 23'ün tekrarı). Sıra first-parent zincirden okundu
(`8ce8cfb` #581 → `9042883` #582 → `1c103de` #580), `mergedAt`'ten değil.

**Canlı ölçüm (görev 3) — 🔴 teslim doğrulanamadı, nedeni adıyla kondu.** 13:15Z:
`main` = `8ce8cfb`, canlı = `3644cbe3` (**26 geride**; `3644cbe3` `main`'in atası,
ayrışmış değil). `GET /` **200**, `build-info` → `3644cbe3` → **stale but healthy**.
Tip `8ce8cfb`'de **hiç `Vercel` status girdisi yok** (`total_count: 0`) → **#547**
durumu (yeni Vercel hesabında GitHub Git bağlantısı yok), #319 rate-limit salınımı
**değil** (o, `Vercel: Deployment rate limited` girdisi bırakır). Depodan
düzeltilemez; sahip tarafı (Vercel Dashboard → Git) veya LANE-INFRA `VERCEL_TOKEN`
workflow'u. Bu lane'in sekizinci doğrulanamayan teslimi ve sebebi dışsaldır.

**Merge kuyruğu (görev 1).** Açık PR: yalnız **#579** (`lane/infra`,
`agent:blocked` — `.github/workflows/verify-production-deployment.yml` değiştiriyor,
iki fren gereği insan-onayı bekliyor). Bu lane'in kapsamı dışında; merge edilebilir
bekleyen PR yoktu.

**Devredilenler.** #547 (teslim donmasının kök nedeni, `agent:infra` +
`agent:blocked`) yeni kanıtla (26 geride, `total_count: 0`) hâlâ geçerli.

---

## Tur 15 — 2026-11-10 (delivery restored)

**Kapsam.** Teslim döngüsünün *sonunda* duran soru: `main` ile canlı site ayrıştı
mı? Sekiz turdur cevap "evet, 26 commit geride" idi ve sebep **#547** (yeni Vercel
hesabında GitHub Git bağlantısı yok) olarak adlandırılmıştı. Bu tur o durumun
**bittiğini** kaydediyor.

**Merge kuyruğu (görev 1).** Bu lane'in PR'ı **#586** (finding 26 — prune
body-read abort) zorunlu kontrolü geçtikten sonra `app/github-actions` tarafından
**14:15:57Z**'de squash ile merge edildi (`main` `df691cd` → `ce0ccee`). Aynı
dakikada `lane/qa`'nın **#585**'i de indi (`089a534`). **#583** (`df691cd`) ise
13:15Z kontrolünden sonra inmiş ve kaydedilmemişti — kural 4 gereği üçü birlikte
kaydedildi. Sıra first-parent zincirden okundu, `mergedAt`'ten değil.

**Canlı ölçüm (görev 3) — ✅ ilk doğrulanmış teslim.** 14:20Z: `main` = `089a534`,
canlı = `089a534` — **eşit**. `verify-production-deployment.mjs --expect 089a5348`
→ exit 0, `verdict: ✅ serving 089a5348`, HTTP kanalıyla doğrulandı, 5/5 smoke
route 200. `Vercel` commit status'u — ~11:13Z'den beri **hiç yoktu**
(`total_count: 0`, #547'nin donmuş hâli) — **14:16:07Z'de geri geldi**:
`pending — "Vercel is deploying your app"`, ardından `success — "Deployment has
completed"`. Donma **bitti**; prodüksiyon merge'den ~90 sn sonra `main`'i izledi.

**Ayırt etme dersi (finding 27).** "Donmuş" ile "entegrasyon çalışıyor" **status'un
varlığı** ile ayrılır, *durumu* ile değil: `Vercel` girdisi **yoksa** Git
entegrasyonu kapalıdır (hiç build istenmemiş — #547); **varsa** — `pending`
iken bile — entegrasyon canlıdır ve build uçmaktadır. `pending` bir girdiyi
#319 rate-limit salınımı (o *kırmızı* bırakır) sanmak yanıltıcı olurdu. Kod
değişikliği gerekmedi; `verify-production-deployment.mjs` iki kanalı zaten ayrı
raporluyor. Bu turda yapılan, durumu doğru okumak ve değişimi kaydetmekti.

**Merge kuyruğu (kalan).** Açık PR'lar: **#585** (`lane/qa`) ve **#584**
(`lane/operator`) — ikisi de bu turda inmiş/merge edilmiş durumda; kalan açık
PR yok. `agent:blocked` PR yok. Bu lane'in merge edecek bekleyen işi kalmadı.
