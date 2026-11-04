# LANE-URUN — ürün & domain (dikey dilimler)

Ürünün iş mantığını taşıyan dikey dilimlerin sahibi. İlan, şirket, aday, başvuru,
paket, mesaj, belge, özgeçmiş, geri bildirim, satış, konum, bakanlık, PWA.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`.
- `src/features/<ad>/` bir dikey dilimdir: server action + UI + parser + test bir arada.

## Sahip olduğun yollar
`src/features/applications/**`, `src/features/billing/**`, `src/features/candidates/**`,
`src/features/chat/**`, `src/features/companies/**`, `src/features/credit-ledger/**`,
`src/features/documents/**`, `src/features/editorial/**`, `src/features/feedback/**`,
`src/features/jobs/**`, `src/features/locations/**`, `src/features/ministry/**`,
`src/features/pwa/**`, `src/features/resumes/**`, `src/features/sales/**`,
`src/server/config/**`, `src/server/push/**`, `src/lib/analytics/**`, `src/lib/pwa/**`

**İstisnalar (sahibi başkası):** `src/features/identity/**` = AUTH;
`src/features/**/structured-data*.ts` ve `job-posting-structured-data.ts` = GEO.
Bunlara dokunma; ihtiyacın varsa kendi brief'ine TODO yaz.

## Hedef
1. **Doğruluk:** iş kuralları sınırda doğrulanıyor mu (boş/çok uzun/yanlış tip girdi)?
2. **Yetki:** her action oturum ve rol kontrolü yapıyor mu? Başkasının kaydına erişim var mı?
3. **Durum yönetimi:** yükleniyor/boş/hata durumları gerçek mi, yoksa sessizce yutuluyor mu?
4. **Yarış durumları:** çift gönderim, eşzamanlı güncelleme, idempotent olmayan işlem.
5. **Test:** her dilimdeki saf mantık (parser, slug, hesap) birim testli mi?

## Kurallar
- `main`'e push YOK; `lane/urun` dalı + PR.
- Sadece sahibi olduğun dosyalara yaz. Ortak yardımcı gerekiyorsa rapor et.
- CI yeşil: `bun run lint`, `typecheck`, `check:frontend-source`, `test:unit`.
- Skill: `code-review`, `qa-changes`.

---

## Çalışma notları (lane/urun)

### Tur 1 — kaynak ilan hattında iki gerçek hata (jobs dilimi)

**1. `buildSourceJobSlug` sonsuz döngü (yüksek önem).**
`src/features/jobs/source-job-import.ts` içinde çakışma çözümü `clampSlug(\`${withCompany}-${counter}\`, 100)`
ile yapılıyordu. Slug 100 karakter sınırına oturduğunda sayaç eki kırpılıyor,
her aday aynı (alınmış) diziye çöküyor ve `while` döngüsü hiç bitmiyordu —
yani `scripts/import-source-jobs.ts` toplu içe aktarmada asılı kalıyordu.
Kanıt: temel uygulamada üçüncü çağrı `timeout` ile kesildi (exit 124);
düzeltmeden sonra 0 ms'de geçerli slug döndü. Çözüm: ek için yer ayıran
`withCounterSuffix` (100 − ek uzunluğu kadar kırp) — böylece her sayaç farklı.

**2. `decodeHtmlEntities` / `decodeHtml` aralık dışı kod noktasında çöküyor (orta-yüksek).**
`String.fromCodePoint` sınır denetimi olmadan çağrılıyordu; kazınmış HTML'deki
bozuk `&#x110000;` bir `RangeError` atıyor, bu `String.replace` içinde tüm metin
çıkarımını durdurup içe aktarmayı düşürüyordu. Çözüm: aralık dışı ve vekil
(surrogate) kod noktalarını ham hâliyle bırakan `decodeNumericEntity`; her iki
modül (`source-job-import.ts`, `iskibris-source-parser.ts`) aynı korumalı
kod çözücüyü paylaşıyor (kod-simplifier bulgusuna göre yinelenen kopya kaldırıldı).

**3. Boş şirket adı sonunda tire.** Şirket adı slug'lanabilir karakter
içermediğinde (`"***"`) eski kod `source-iskibris-garson-` gibi sonu tireli bir
slug üretiyordu; bu DB slug CHECK'ini (`^[a-z0-9]+(-[a-z0-9]+)*$`) ihlal eder.
Çözüm: şirket slug'ı boşsa taban slug'a düş ve `clampSlug` baştaki/sondaki
tireleri temizlesin.

**Eklenen test:** `src/features/jobs/source-job-import.test.ts` (5 test) —
sonlandırma, her uzunlukta benzersiz+geçerli slug, tireli-kenar ve kod noktası
aralık denetimleri. `bun run test:unit` 353 → 358 yeşil.

**Çalıştırılan kontroller:** `bun run lint`, `bun run typecheck`,
`bun run check:frontend-source`, `bun run test:unit` → hepsi yeşil.
Canlıya dokunulmadı (yalnız `src/features/jobs/**`, DB yazımı yok).

### TODO (sahiplerine)
- (yok)

---

## Tur 2 — anonim posta yollarında istismar kontrolü (#103)

### Alınan issue
`gh issue list --state open --label agent:backend` → **#103** (sahibi LANE-URUN).
İkinci sıradaki **#102** alınmadı (gerekçe aşağıda, "Devredilen").

### Doğrulanan kanıt
`tests/security/anonymous-write-surface.test.ts` içindeki `todo` testi,
`submitFeedback`/`submitSalesLead` action'larının ne captcha ne hız sınırı
taşıdığını statik olarak gösteriyordu; çalıştırınca gerçekten `⚠` (todo) ve
assertion hatası veriyordu. `public.submit_feedback` / `public.submit_sales_lead`
`anon`'a grant edilmiş ve her ikisi de satır oluşunca dış e-posta tetikliyor —
script'li bir çağıran `POST /contact` ile keyfi adrese istek gönderebilir.

### Neden captcha değil, hız sınırı
Auth formlarındaki Turnstile token'ı **Supabase'in kendi auth uç noktalarında**
doğrulanır; `submit_feedback` gibi keyfi bir RPC'de Supabase token'ı doğrulamaz,
dolayısıyla oraya token göndermek işe yaramaz. Her zaman uygulanabilen kontrol
sunucu tarafı hız sınırıdır: istemci turu ve sır gerektirmez, yanlış
yapılandırmayla kapanmaz.

### Değişen dosyalar (yalnız sahip olduğum yollar)
- `src/features/abuse/rate-limit.ts` — sabit pencereli limiter; enjekte edilebilir
  saat, `MAX_TRACKED_KEYS=5000` üst sınırı (spoof edilen adres seli belleği
  sınırsız büyütemez; en eski kova atılır, yeni çağıran reddedilmez).
- `src/features/abuse/request-context.ts` — istemci adresi (`cf-connecting-ip` →
  `x-real-ip` → `x-forwarded-for` ilk girdi); saf `clientIpFromHeaders` ile testli.
- `src/features/abuse/limits.ts` — 10 dk / 5 deneme bütçesi (feedback, sales).
- `src/features/feedback/actions.ts`, `src/features/sales/actions.ts` — RPC ve
  postadan **önce** IP ve gönderilen adres başına kontrol. Sınır aşılırsa mevcut
  `failed` kopyası döner (script'li çağıran sınırı tetiklediğini ayırt edemez).
- `src/features/abuse/rate-limit.test.ts` (5 test), `request-context.test.ts`
  (4 test) — sınır, pencere sıfırlanması, anahtar izolasyonu, üst sınır tahliyesi,
  başlık önceliği.

### Kapılar
`bun run lint`, `bun run typecheck`, `bun run check:frontend-source`,
`bun run test:unit` (365 → **374** yeşil; 9'u yeni), `bun run test:security`
(17 pass / 4 todo → ilgili todo **✔** geçiyor), `bun run build` (throwaway
`NEXT_DIST_DIR`) → hepsi yeşil. Canlıya dokunulmadı; DB/migration yok.

### Sınır (dürüst not)
Limiter **süreç içi/bellekte**dir: serverless'ta örnek başına çalışır, yani
etkin sınır `limit × örnek`. Sınırsız bir posta döngüsünü sınırlı hâle getirir,
ama **tam** bir paylaşımlı sayaç değildir; o bir Redis/Upstash gerektirir
(repo'da yok). Bu takas `rate-limit.ts` başlığında yazılı.

### Devredilen: #102 (`server-only` işareti) — alınmadı, üç somut engel
1. **Sahiplik:** `src/server/email/unsubscribe-token-core.ts` sahiplik tablosunda
   (00-orchestration + `scripts/lanes.json`) **hiçbir lane'e ait değil**.
   LANE-URUN'un sahip olduğu `src/server` yolları yalnız `config/**` ve `push/**`.
2. **Test kırılıyor:** `import "server-only"` eklemek `tests/unit/unsubscribe-token.test.ts`
   (LANE-QA dosyası) testini **düşürüyor** — deneyle doğrulandı: `server-only`
   çalışma zamanı dışında `throw` ediyor, `tsx --test` çıktısı `fail 1`.
   Dosyanın `src/server`'daki emsalleri (`mailer.ts` vb.) kendi birim testine
   sahip değil; bu modülün sahip.
3. **Başkasının dosyası:** düzeltme ya `tests/unit/**` (QA) ya da `src/server/email/**`
   (sahipsiz) dokunmayı gerektirir; ikisi de benim sahiplik listem dışında.
→ Öneri: sahiplik tablosuna `src/server/email/**` için bir sahip tanımlanmalı ya da
  test, `server-only` işaretini bir modül sınırı olarak değil, kaynak taraması
  olarak (dosya metninde `import "server-only"` var mı) denetlemeli — o zaman
  birim testi kırılmadan #102 kapatılabilir. Bu bir **test yazım** kararı olduğu
  için LANE-QA'ya bırakıldı.

### Sonraki lane için notlar
- `src/messages/**` sahiplik tablosunda **yok**. Bu turda mesaj kataloğuna yeni
  anahtar (`rateLimited`) eklemek yerine mevcut `failed` kopyası kullanıldı, çünkü
  lane kuralı sahip olmadığın dosyayı düzenlemeyi yasaklıyor. Ayrı kopya istenirse
  katalog sahibi (muhtemelen LANE-TASARIM/LANE-INFRA) `FeedbackForm.messages` ve
  `SalesLeadForm.messages`'a `rateLimited` eklemeli; `i18n-message-catalogs.test.ts`
  altı dilde anahtar eşitliğini zaten zorluyor.
- Aynı desen (`createRateLimiter` + `clientIp`) başka anonim yazma yollarına da
  uygulanabilir; `src/features/abuse/limits.ts` tek yer.

---

## Tur 3 — açık yönlendirme kapatıldı (#101, kapanmış sanılan gerçek açık)

### Neden alındı
Kuyruk taramasında **#108** `agent:backend` göründü ama durumu **CLOSED**'dı
("Duplicate of #101"). Doğrulayınca #101'in **hâlâ açık** ve `lane:urun` etiketli
olduğu, hatanın `main` üzerinde **canlı** olduğu ortaya çıktı:

```
sanitizeNextPath("/..//evil.example") -> "//evil.example"
new URL("//evil.example", "https://isbulkktc.com/install").origin === "https://evil.example"
```

`src/lib/pwa/destination.ts` LANE-URUN'un sahip olduğu `src/lib/pwa/**` altında.
Yani bu, lane'in en yüksek etkili sınırlı işiydi (posterden taranan QR ile
phishing). #108'i "kapandı" sayıp geçmek yanlış olurdu.

### Kök neden
Girdi `//` ile **başlamıyordu**, bu yüzden giriş kontrolü geçiyordu. Ama fonksiyon
dönüş değerini `new URL(value, base)` ile kurup `pathname+search+hash`
döndürüyordu; WHATWG çözümleyicisi `..`/`.` segmentlerini **önce** işlediği için
`..` tek slash'ı yutup baştaki `//`'i geri getiriyordu. `resolved.origin` kontrolü
bunu yakalayamaz — origin her zaman base'in origin'idir.

### Düzeltme
`src/lib/pwa/destination.ts` — normalize edilen **çıktı** yeniden doğrulanıyor:
`//` ile başlıyorsa, `\` içeriyorsa veya şema taşıyorsa `null`. Girdi kontrolleri
olduğu gibi korundu; normal yollar (`/jobs`, `/jobs?x=1`) aynen dönüyor.

### Eklenen test
`src/lib/pwa/destination.test.ts` (3 test) — nokta-segment kaçışı, fuzz korpusu
(49 kombinasyon), ve meşru yol normalizasyonu (`/jobs/../profile -> /profile`).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (374 → **377**)/test:security →
hepsi yeşil; `tests/security/open-redirect.test.ts`'teki iki `todo` artık **✔**.
Canlıya dokunulmadı.

### Not (sahiplerine)
- **#108 kapalı ama hata `main`'de canlıydı.** Bir issue'yu "duplicate" diye
  kapatmak, orijinali (#101) kapatmaz; kuyruk tararken `state` kontrol edilmeli.
  Bu turda LANE-URUN farkı yakaladı ve düzeltti.
