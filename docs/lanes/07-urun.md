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

---

## Tur 4 — micro-denetim (AUDIT.md), bulgu: `new URL` çökmesi

### Envanter
`git ls-files` ile sahip olduğum yollar: **83 dosya** (5 yeni `abuse/` dahil).
Boyut boyut tarandı; her dosya aşağıdaki tabloda bir sonuç taşır.

### Bulgu (düzeltildi)

**`src/features/companies/directory.ts` — doğrulanmamış `new URL` ile sayfa çöküyor (yüksek).**

- **Gözlenen:** `sameLocation` (satır 129/132) ve `getCompanyIdentityKeys`
  (satır 182) `website` alanını `try` olmadan `new URL(...)` ile çözüyordu.
  `website` yalnız DB CHECK `^https?://[^\s]+$` ile sınırlı ve DAL'da düz
  `string` olarak tipleniyor; bu regex'i geçip `new URL`'ü patlatan değerler var:
  `http://[`, `https://]`, `https://%zz`. Deneyle doğrulandı:
  `deduplicateCompanyDirectory([...website:"http://["...])` → `TypeError: Invalid URL`.
- **Beklenen:** bozuk bir `website` yalnız o alanı düşürmeli; sayfa çökmemeli.
- **Etki:** `/[locale]/companies` herkese açık rota; tek bozuk satır tüm dizin
  sayfasını 500'e çeviriyordu (render yolunda `company-directory.tsx:302` de aynı
  riski taşıyordu).
- **Düzeltme:** yeni `src/features/companies/website-domain.ts`
  (`companyWebsiteDomain`) — `try/catch` ile `null` döner. Üç çağrı yeri
  (dedupe anahtarı ×2, render etiketi) bu yardımcıyı kullanıyor. `company-logos.ts`
  zaten aynı desenle korumalıydı; bu, eksik kalan yerdi.
- **Test:** `src/features/companies/website-domain.test.ts` (3 test) — bozuk
  değerler `null`, normal değer host döner, dedupe bozuk satırla çökmez.

### Taranan boyutlar → sonuç

| Boyut | Bulgu |
|---|---|
| Doğruluk (sınır girdi) | ✅ saf fonksiyonlar sınandı (slug, district, özet, CSV, parser): bozuk girdi `null`/güvenli dönüyor |
| Hata yolu | ⚠️ **1 bulgu** — yukarıdaki `new URL` çökmesi (düzeltildi) |
| Yetki | ✅ 7 action'ın hepsi oturum + rol/üyelik kontrolü yapıyor; RPC kodları `42501`'e eşleniyor |
| Yarış / idempotency | ✅ çift gönderim RPC unique kısıtlarına (`23505`) bağlı; `upsert` kullanılıyor |
| Sızıntı (log/PII) | ✅ loglar yalnız `code` taşıyor, e-posta/içerik yok |
| Sorgu | ✅ `select("*")` yok; dar kolon seçimleri |
| Ölü kod | ✅ kullanılmayan export/ulaşılamaz dal bulunmadı |
| Yorum | ✅ yorumlar sezgi-dışı olanı açıklıyor; tekrar eden yok |

### Kapsam dışı bırakılan (bakılmadı işareti)
- `src/features/candidates/resume-parser.ts` (876 satır): yalnız fonksiyon
  sınırları + uç girdi probu ile tarandı, **satır satır okunmadı**. Boş/uzun/
  emoji/`\u0000` girdileri güvenli (`hasResumeDraftContent=false`, çökme yok).
- `src/features/companies/company-directory.tsx` (420 satır) ve
  `src/features/pwa/install-experience.tsx`: yalnız değiştirdiğim render
  yolu ve `new URL` siteleri incelendi; kalan JSX satır satır okunmadı.
- `src/features/companies/data/*.json`: veri dosyası, kod değil.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (377 → **380**)/test:security →
hepsi yeşil. Canlıya dokunulmadı.

---

## Tur 5 — satış formu telefonu sessizce düşürüyordu (#135)

### Alınan issue
`gh issue list --state open --label agent:backend` → **#135** (sahibi LANE-URUN,
`bug`). #102 hâlâ engelli (aşağıda "Devredilen" — bu kez `agent:handoff`).

### Doğrulanan kanıt
`src/features/sales/schemas.ts:9` telefonu yalnız üst sınırla doğruluyordu
(`z.string().trim().max(32).optional().or(z.literal(""))`). Çalıştırınca:

```
salesLeadSchema.parse({ email:"a@b.com", phone:"12" })  -> ok("12")   // kabul!
salesLeadSchema.parse({ email:"a@b.com", phone:"123" }) -> ok("123")  // kabul!
```

Ama `sales_leads.phone` CHECK'i `between 4 and 32` ister; RPC (PR #133, merge
edildi) eşiğin altındaki değeri **null** yazıyor. Yani kullanıcı "12" yazıp
gönderiyor, kayıt başarılı görünüyor, ama numarası sessizce kayboluyordu —
kullanıcı hiçbir geri bildirim almıyordu.

### Düzeltme (issue'nun ilk seçeneği: görünür doğrulama)
- `src/features/sales/schemas.ts` — telefon artık girildiyse en az 4 karakter:
  `.refine((v) => v.length === 0 || v.length >= 4)`. Boş/`undefined` geçerli
  kalır (alan isteğe bağlı), 4–32 geçer, 33+ yine reddedilir.
- `src/features/sales/sales-lead-form.tsx` — input'a `minLength={4}`. HTML
  `minlength` boş değeri muaf tutar, yani isteğe bağlı alan boşken form
  gönderilebilir; kısa değer girilirse tarayıcı gönderimi engeller ve
  **yerelleştirilmiş** bir "en az 4 karakter" mesajı gösterir.
- Sözleşme uyumu: kısa telefon artık lead'i **düşürmüyor**; `invalid` durumuna
  düşüp kullanıcıya söylüyor, DB tarafı (RPC) da zaten null yazıyor.

### Eklenen test
`src/features/sales/schemas.test.ts` (4 test) — eşik altı reddi, boş/`undefined`
kabulü, 4+ kabul + trim, üst sınır reddi. QA'nın
`tests/unit/sales-lead-schema.test.ts`'i değişmeden geçiyor.

### Fonksiyonel doğrulama (gerçek tarayıcı)
Üretim standalone sunucusu (`NEXT_DIST_DIR=.next-urun`) ayağa kaldırılıp
`/en/packages` gerçek Chromium ile açıldı:

```
input.minLength = 4
phone "12"  -> valid=false, tooShort=true,  "Please lengthen this text to 4 characters or more…"
phone "1234"-> valid=true
phone ""    -> valid=true   (alan isteğe bağlı)
```

SSR HTML: `<input id="sales-phone" … maxLength="32" minLength="4" …>`.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (419 → **423**)/test:security +
`bun run build` (throwaway `NEXT_DIST_DIR`) → hepsi yeşil. Canlıya dokunulmadı
(DB/migration yok; SQL zaten PR #133 ile inmiş).

### Devredilen: #102 (`server-only` işareti) — `agent:handoff`
Yeni devir protokolüne göre yeniden etiketlendi: `agent:blocked` kaldırıldı,
`agent:handoff` + `lane:qa` + `lane:infra` eklendi. Gerekçe değişmedi
(`src/server/email/**` sahipsiz; `server-only` eklemek `tsx --test` altında
`tests/unit/unsubscribe-token.test.ts`'i düşürüyor). Düzeltme LANE-QA'nın
testi kaynak taramasına çevirmesini ya da LANE-INFRA'nın test runner'ına
`react-server` koşulunu eklemesini gerektirir.

### Tur 5 denetim tablosu (sales dilimi)

| Boyut | Sonuç |
|---|---|
| Doğruluk (sınır) | ⚠️ **1 bulgu** — telefon alt sınırı (düzeltildi) |
| Yetki | ✅ anonim yazma yolu; hız sınırı Tur 2'de eklendi |
| Durum yönetimi | ✅ `invalid`/`failed`/`submitted` gerçek; artık kısa telefon sessizce yutulmuyor |
| Yarış / idempotency | ✅ RPC tek INSERT; `leadId` idempotency anahtarı postada |
| Sızıntı | ✅ loglar yalnız `code` |
| Test | ✅ yeni `schemas.test.ts` (4) + mevcut QA şeması |

---

## Tur 6 — geçersiz RESEND_API_KEY sessizce yutuluyordu (#186)

### Alınan issue
`gh issue list --state open --label agent:backend` → **#186** (sahibi LANE-URUN).
Kuyrukta `lane:urun` etiketli tek sınırlı iş buydu; #102 ve diğerleri başka
lane'lere handoff edilmiş durumda.

### Doğrulanan kanıt (secret değeri yazdırılmadan)
```
RESEND_API_KEY       : len=36 prefix=d81 sha256=2f0d4c83622b
SUPABASE_ACCESS_TOKEN: len=36 prefix=d81 sha256=2f0d4c83622b
AYNI MI: True        (Resend anahtarı `re_` ile başlar → bu değer başlamıyor)
```
Yani Supabase access token'ı Resend alanına kopyalanmış.

### Kapsam ayrımı (issue'nun kendisi böyle diyor)
- **1. Doğru anahtarı gir + doğrula** → canlı env/secret, panel erişimi → **insan**.
- **2. Sessiz başarısızlığı kaldır** → **LANE-URUN (bu tur)**.
- **3. Secret karışıklığını önle** → 1 ile aynı → insan.

### Kök neden (2. madde)
`src/server/email/mailer.ts` `getResend` her kullanılamaz anahtarı
"yapılandırılmamış" sayıp `null` dönüyordu; `deliver` tek satır `console.warn`
ile geçiyordu. *Var ama yanlış* ile *hiç yok* aynı sessiz davranıştı — hatanın
aylarca görünmemesinin nedeni bu.

### Düzeltme (yalnız sahip olduğum + issue'nun atadığı yüzey)
- **Yeni `src/server/config/resend-key.ts`** (`classifyResendApiKey`, saf,
  `src/server/config/**` LANE-URUN sahipliğinde): `missing | malformed | present`.
- **`src/server/email/mailer.ts` `getResend`** üç durumu ayırır: `missing` →
  mevcut uyarı; `malformed` → `console.error("email_health", { event:
  "resend_key_malformed", … })` (alarm bağlanabilir); `present` → `new Resend`.
  `deliver` yanıltıcı "not configured" satırını artık basmaz.
- `mailer.ts` sahiplik tablosunda **sahipsiz**; #186 açıkça bu yarıyı LANE-URUN'a
  veriyor ve hiçbir lane o dosyayı düzenlemiyor (açık PR'lar kontrol edildi).

### Eklenen test
`src/server/config/resend-key.test.ts` (3 test) — missing/blank, geçerli `re_`,
"var ama yanlış biçim" (Supabase token kopyası dahil).

### Fonksiyonel doğrulama
`--conditions=react-server` (Next'in sunucu koşulu; `server-only` boş modüle
çözülür), ağ çağrısı yok:
```
missing      -> warn  "Outbound email skipped: RESEND_API_KEY is not configured."
malformed    -> error "email_health" {"event":"resend_key_malformed", …}
blank        -> warn  "Outbound email skipped: RESEND_API_KEY is not configured."
```

### Kapılar
lint/typecheck/check:frontend-source/test:unit (444 → **447**)/test:security →
hepsi yeşil. Canlıya dokunulmadı (secret yazımı yok, DB yok).

### Devredilen (insan) — #186'ın 1. ve 3. maddesi
Doğru `RESEND_API_KEY` (`re_…`) panelden girilip doğrulanmalı:
`curl -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains`
→ `isbulkktc.com status: verified`. Bu bir panel/secret işlemidir, lane yapamaz.

### Notlar
- **CI flake'leri:** `Database` ve `E2E` job'ları bu turda **"Start the seeded
  local Supabase stack"** ve **"Install Playwright browser"** adımlarında
  düştü — ikisi de Docker/apt altyapısı, TypeScript değişikliğiyle ilgisiz.
  `gh run rerun --failed` ile geçti/geçiyor.
- **`src/server/email/**` hâlâ sahipsiz.** #102 (server-only) da bu yüzden
  handoff. Öneri: sahiplik tablosuna `src/server/email/**` için sahip tanımla.

---

## Tur 7 — CV tarih çıkarımı bağlamsızdı (#208)

### Alınan issue
Kuyrukta `lane:urun` + `agent:backend` etiketli **#208**: "CV'den az bilgi
çekiliyor + tarihler yanlış kutuya işliyor (doğum yılı → iş deneyimi)".
Sahip olduğum `src/features/candidates/**` içinde, sınırlı ve yüksek etkili.
#191 (marka paleti) alınmadı: sahiplik çelişkisi + çok lane'li (aşağıda).

### Doğrulanan kanıt (issue'nun ölçümü yeniden üretildi)
`resume-parser.ts` içindeki `dateToken` gün/ay opsiyonel olduğu için **çıplak
yıl** her bağlamda tarih sayılıyordu:
```
"1995-2000 doğumlu"      -> 1995 - 2000   (iş deneyimi oldu)
"Adres: Lefkoşa - 2019"  -> 2019
"Date of birth: 1990"    -> 1990
```

### Düzeltme (Hata 1 — sınırlı tutuldu)
- **Kişisel veri bağlam filtresi** (`isPersonalDataLine`): `doğum, adres,
  telefon, kimlik, pasaport, nüfus` gövde; `age, birth, born, dob, address,
  phone, tel, gsm, tc, tcno, yaş, iban` tam kelime. `extractDateRange` ve
  `extractDates` bu satırları atlar.
- **Aralık mantığı** (`isValidYearRange`): iki ucu yıl olan aralık ileri ve
  ≤ 60 yıl olmalı; `2023 - 2019` / `1900 - 1999` tümden reddedilir.
- `doğu` (east) bilinçle gövde değil → `Doğu Akdeniz Üniversitesi` eğitimi
  hâlâ ayrışıyor; İngilizce kelimeler tam → "management" ≠ "age".

### Eklenen test
`src/features/candidates/resume-date-context.test.ts` (6 test). Mevcut
`resume-parser` / `resume-parser-multiline` / `resume-profile-draft` (17 test)
değişmeden geçiyor.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (447 → **453**)/test:security →
hepsi yeşil. Canlıya dokunulmadı.

### Devredilen (#208 Hata 2 ve Hata 3)
Kapsam artırma (10+ gerçek CV formatı, tabular/iki kolon/PDF bozulması) ve
alan→kutu eşleme testi + profil skoru ölçümü (%100 hedefi) **LANE-QA** + daha
geniş parser çalışması gerektiriyor; sınırlı tutmak için alınmadı. Issue açık.

### Devredilen (#191 — marka paleti): sahiplik çelişkisi
#191 `supabase/functions/_shared/email-{layout,render}.ts`'i **LANE-URUN**'a
veriyor; ama sahiplik tablosu `supabase/**`'ı **LANE-SUPABASE**'e veriyor
(`lane-collisions.mjs` de öyle diyor). Kural: sahip olmadığın dosyaya yazma.
#191'e karar isteyen yorum bırakıldı; ayrıca `lane-collisions.mjs` CI'a bağlı
değil (INFRA önerisi). LANE-URUN o iki dosyaya **yazmadı**.

---

## Tur 8 — kullanıcıya iç veri sızan ilçe metriği (#220)

### Alınan issue
Kuyrukta **yalnız `lane:urun`** etiketli (handoff'suz) tek iş **#220** idi:
`/companies` sayfası, hiç filtre seçilmemişken "Güvenilir ilçe bilgisi
bulunmayan 53 şube…" notunu basıyordu.

### Doğrulanan kanıt (canlı + kod)
- Kod: `company-directory.tsx:414` notu **koşulsuz** render ediyordu; sayaç
  (`:67`) `companies` (tüm rehber) üzerinden hesaplanıyordu, `filteredCompanies`
  değil. Kullanıcı 3 sonuç görse de not "53 şube" diyordu.
- Üretim standalone + gerçek Chromium: SSR'de `company-directory-source-note`
  paragrafı **2** (biri hukuki `sourceNote`, biri iç metrik).

### Karar: Seçenek 1 — notu tamamen kaldır
İç veri kalitesi metriği; kullanıcı ne olduğunu anlamıyor, filtre seçmemişken
alakasız, "dahil edilmez" olumsuz ve verinin güvenilmez olduğu izlenimini
veriyor. `sourceNote` (hukuki sorumluluk reddi) **kaldı** — gerekli.

### Değişen dosya (yalnız sahibim)
`src/features/companies/company-directory.tsx` — 16 satır silindi:
`unclassifiedLocationCount` memo'su ve `districtDataNote` paragrafı.
`useMemo` hâlâ `categories`/`filteredCompanies` için kullanılıyor.

### Fonksiyonel doğrulama (gerçek tarayıcı)
```
en: note paragraphs = 1; visible internal-data phrases = []
de: note paragraphs = 1; visible internal-data phrases = []
```
SSR: `company-directory-source-note` **2 → 1**.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (494 test, 0 fail)/test:security
+ `bun run build` (throwaway `NEXT_DIST_DIR`) → hepsi yeşil. Canlıya dokunulmadı.

### Devredilen: #255 — LANE-ICERIK (`src/messages/**`)
Notu basan kod gitti ama **`CompanyDirectory.districtDataNote`** anahtarı altı
katalogda duruyor. `src/messages/**` sahiplik tablosunda **sahipsiz** (LANE-ICERIK
henüz tabloda ve `scripts/lanes.json`'da yok). Kural: sahibi olmadığın dosyaya
yazma → `agent:content` + `agent:handoff` + `lane:icerik` ile issue #255 açıldı.

### Denetim tablosu (companies dilimi)

| Boyut | Sonuç |
|---|---|
| Doğruluk / sızıntı | ⚠️ **2 bulgu** — iç metrik koşulsuz render + filtresiz sayaç (düzeltildi) |
| Hata yolu / durum | ✅ boş/yükleniyor/hata durumları gerçek (empty state, pagination) |
| Erişilebilirlik | ✅ kontroller etiketli; `role="status" aria-live` sonuç sayısı; dış linklerde `rel="noopener noreferrer"` |
| Linkler | ✅ `href`'ler geçerli (tel/mailto/maps/web), `target="_blank"` + `rel` |
| Mantık | ✅ sayfalama `Math.min(page, pageCount)` ile sınırlı; filtre değişince `setPage(1)` |
| Test | ✅ mevcut E2E `company-directory.spec.ts` filtre/empty akışını kapsıyor |

---

## Tur 9 — push endpoint'inde SSRF (#262)

### Alınan issue
Kuyrukta `lane:urun` etiketli **#262** (SSRF). `src/server/push/**` benim
sahipliğimde; issue ayrıca `src/app/api/push/**` ve `src/features/pwa/actions.ts`'i
de LANE-URUN'a veriyor.

### Doğrulanan kanıt (issue'nun ölçümü yeniden üretildi)
Tek kontrol `z.string().url().min(12).max(1024).startsWith("https://")` idi; host
kısıtı yoktu. Yerel bir TCP dinleyicisi + uygulamanın kendi şeması:
```
önce: route schema accepts loopback endpoint: true   → worker 1 bağlantı / 1568 bayt TLS
```
Yani kayıtlı bir endpoint worker'ı dağıtımın iç ağındaki keyfî adrese bağlıyordu.

### Düzeltme (sahip olduğum + issue'nun atadığı yüzey)
- **Yeni `src/server/push/push-endpoint.ts`** (`isAllowedPushEndpoint`, saf):
  allowlist — `fcm.googleapis.com`, `android.googleapis.com`,
  `updates.push.services.mozilla.com`, `web.push.apple.com`,
  `*.notify.windows.com` / `*.push.apple.com` / `*.push.services.mozilla.com`.
  Reddedilen: IP literal, ondalık-kodlu adres, `localhost`, `.local`/`.internal`/
  `.home.arpa`, https-dışı şema, authority'de kimlik bilgisi.
- **İki yazma yolu:** `src/app/api/push/subscriptions/route.ts` ve
  `src/features/pwa/actions.ts` `savePushSubscription`.
- **Gönderim ucu (savunma derinliği):** `src/server/push/vapid.ts`
  `sendPushMessage` — eski bir satır worker'ı yoklamaya çeviremez; yeni `blocked`
  durumu dispatcher'da `gone` gibi emekliye ayrılır.
- **Refine zincirin sonuna eklendi:** `...startsWith("https://").refine(isAllowedPushEndpoint)`.
  Böylece LANE-GÜVENLİK'in `tests/security/push-endpoint-ssrf.test.ts` içinde
  sabitlediği "https URL" sözleşmesi **bozulmaz** (kendi yorumu: *"when the owner
  adds a host allowlist they can be promoted to gates"*).

### Çapraz-lane koordinasyon (önemli)
LANE-GÜVENLİK'in PR #268'i (birleşti) testi iki yazma yoluna genişletti **ama
eski regex'i yine sabitliyordu**; düzeltmem inince kırıldı. `tests/security/**`
onların sahipliğinde olduğu için **dokunmadım**; #268'e koordinasyon yorumu
bıraktım ve refine'ı zincirin sonuna ekleyerek çakışmayı **testlerini kırmadan**
çözdüm. Sonuç: `test:security` 73 test / 0 fail; SSRF `todo`'su kapıya terfi
etmeye hazır (onların işi).

### Eklenen test
`src/server/push/push-endpoint.test.ts` (4 test) — gerçek servisler kabul;
loopback/özel/link-local/metadata/ondalık/`localhost`/`.internal` red;
allowlist-dışı host ve https-dışı red; string olmayan girdi çökmez.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (559, 0 fail)/test:security
(73, 0 fail) + `bun run build` (throwaway `NEXT_DIST_DIR`) → hepsi yeşil.
Canlıya dokunulmadı.

### Devredilen
- **LANE-SUPABASE:** `register_push_subscription` RPC'si doğrudan çağrılabildiği
  için aynı host kuralı orada (ve mümkünse tablo CHECK'inde) uygulanmalı.
- **LANE-GÜVENLİK:** `push-endpoint-ssrf.test.ts` → "documents the gap" testi
  artık gereksiz; `todo`'yu kapıya terfi ettir.

---

## Tur 11 — e-postada Reply-To ve tek-tık unsubscribe başlıkları (#196)

### Alınan issue
Kuyrukta `lane:urun` + `agent:handoff` etiketli **#196** (LANE-CLOUDFLARE'ın #170
ölçümünden devir): teslim-edilebilirlik eksiği, `src/server/email/mailer.ts`.

### Doğrulanan kanıt
`deliver()` yalnız `from / to / subject / html / text` gönderiyordu; `headers`
ve `replyTo` yoktu:
- `from` varsayılanı `no-reply@isbulkktc.com` → yanıtlar kayboluyordu.
- `sendEngagementEmail` **promosyonel** ailedir ve `unsubscribeUrl` alır; Gmail/
  Yahoo toplu gönderimde `List-Unsubscribe` + One-Click'i şart koşar. Yoktu.

### Düzeltme (yalnız sahip olduğum/atandığım yüzey)
- **Yeni `src/server/email/email-headers.ts`** (saf, env/IO yok):
  `buildEmailHeaders` + `listUnsubscribeHeaders`. RFC 8058 tek-tık çifti;
  mailto fallback izlenen kutu varsa; **https-dışı/bozuk URL → başlık yok**.
- **`mailer.ts`:** `deliver(..., { unsubscribeUrl? })` başlıkları Resend
  gönderimine spread eder; `getReplyToInbox()` = `SALES_INBOX_EMAIL` →
  `SALES_CONTACT_EMAIL` → `FEEDBACK_INBOX_EMAIL`; `sendEngagementEmail`
  `unsubscribeUrl`'ini geçirir (tek-tık yalnız promosyonel ailede).

### Fonksiyonel doğrulama
`fetch` stub'lanıp **gerçek Resend istek gövdesi** yakalandı (ağ yok):
```
transactional (welcome)     : reply_to="destek@isbulkktc.com", headers=undefined
promotional (engagement)    : reply_to + List-Unsubscribe + List-Unsubscribe-Post
```
Yeni test: `src/server/email/email-headers.test.ts` (7 test).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (601, 0 fail)/test:security/
test:integration (48, 0 fail) → hepsi yeşil. Canlıya dokunulmadı.

### Devredilen / kapsam dışı
- DNS/SPF/DKIM: LANE-CLOUDFLARE (ölçüldü, sağlam).
- `[auth.smtp]` + DKIM rotasyonu: LANE-AUTH (#195).
- `src/server/email/**` sahiplik tablosunda **sahipsiz**; #196 açıkça LANE-URUN'a
  veriyor ve başka lane dosyayı düzenlemiyor → yapıldı.

---

## Tur 12 — micro-denetim: ayrıştırılamayan tarih iki yeri bozuyor (PR #316)

### Envanter
`git ls-files` (LANE-URUN sahiplik satırı) → **91 dosya** (72'si kod). Bu turda
`src/features/jobs/**` satır satır okundu + saf mantık modülleri problandı.

### Bulgular (ikisi de aynı kök neden: tarih dizesi doğrulanmadan kullanılıyor)

**1. `job-modified-at.ts` — geçersiz `dateModified` JSON-LD'ye giriyor.**
`Date.parse` NaN olduğunda ham değer dönüyordu:
`resolveJobDateModified("garbage", P)` → `"garbage"`. Çağrı yeri
`job-posting-structured-data.ts:79` → `dateModified`. Fonksiyonun kendi
sözleşmesi "değer yoksa `datePosted`'a düş" diyor; *var ama bozuk* kapsam dışıydı.

**2. `sitemap-lastmod.ts` — sitemap'i çökertebiliyor + sıraya bağlı.**
`new Date("garbage")` geçerli sayılıp `newest` olarak saklanıyordu; NaN'a karşı
karşılaştırma hep `false` olduğu için **geçersiz Date küçültmeyi kazanıyor** ve
`src/app/sitemap.ts:49`'daki `toISOString()` `RangeError: Invalid time value`
atıyordu. Ölçüm: `["garbage", valid]` → THREW, `[valid, "garbage"]` → valid.

### Düzeltme
- `resolveJobDateModified`: `!Number.isFinite(Date.parse(modified))` → `publishedAt`.
- `newestJobModifiedAt`: `Number.isNaN(getTime())` olan satırı **atla** → sonuç en
  yeni gerçek an (ya da `null`), **sıradan bağımsız**.

### Dürüst kapsam notu
`modified_at` public RPC'den geldiği gibi geçiyor; zod yalnız `z.string().min(1)`.
Kaynak sütunlar `timestamptz` → **mevcut seed'de erişilemez**. Yani sertleştirme,
canlı regresyon değil; ama her ikisi de fonksiyonların yazılı sözleşmesini ihlal
ediyor ve bozuk satırda etki yüksek.

### Eklenen test
`tests/unit/job-modified-at.test.ts` (+1), `tests/unit/sitemap-lastmod.test.ts` (+1).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (610, 0 fail)/test:security/
test:integration (48, 0 fail)/build → hepsi yeşil. Canlıya dokunulmadı.

### Taranan ama bulgu çıkmayan (bu turda)
`source-job-fetchers.ts` (`toISOString` çağrıları `isWithinSourceWindow`'ın
finite denetiminden sonra — güvenli), `iskibris-source-parser.ts`,
`source-job-import.ts`, `company-slug.ts`, `directory.ts`,
`company-document-parser.ts`, `job-copy-rewrite.ts`, `presentation.ts`,
`admin-content-schemas.ts`, `push-endpoint.ts`, `web-push-client.ts`,
`notification-copy.ts`. **Not:** `listingPlanFormSchema.color`
(`/^#[0-9a-f]{6}$/`) DB CHECK'i (`~ '^#[0-9a-f]{6}$'`) ile **birebir** aynı —
kasıtlı tutarlılık, bug değil.

### Bakılmayan
`src/features/candidates/resume-parser.ts` (876 satır): yalnız uç-girdi probu;
satır satır okunmadı. `company-directory.tsx`, `install-experience.tsx`: yalnız
ilgili yollar.

---

## Tur 13 — UTF-16 big-endian CV mojibake (#310)

### Alınan issue
Kuyrukta `lane:urun` + `agent:handoff` etiketli **#310** (LANE-QA buldu, bana
devretti): `src/features/documents/text-document-extractor.ts` BE dosyayı bozuk
çözüyor.

### Doğrulanan kanıt (gerçek modül)
`extractPlainText` her iki BOM'u algılıyor ama çözme etiketi sabit `"utf-16"`.
WHATWG Encoding'e göre `utf-16` **yalnız LE**; BE ancak `utf-16be` ile çözülür:
```
FE FF 00 41 00 42  (BE "AB")  önce -> "\uFFFE\u4100\u4200"   sonra -> "AB"
FF FE 41 00 42 00  (LE "AB")        -> "AB"                  -> "AB"
EF BB BF 41 00 42  (UTF-8 BOM)      -> "AB"                  -> "AB"
```

### Düzeltme
Byte-order'a özel etiket: `isUtf16Be ? "utf-16be" : isUtf16Le ? "utf-16le" : "utf-8"`.
Her iki etiket Node'un ICU'suz dağıtımında da desteklenir ve kendi BOM'unu sıyırır;
BOM'suz dosya mevcut `utf-8` yolunu korur.

### Kanıt
LANE-QA'nın `tests/unit/document-import.test.ts` içinde `todo` ile pinlediği test
artık **geçiyor** (`todo` `✔` olur). Kod değişikliği yalnız bu; ek test gerekmedi
(todo zaten kanıt testiydi).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (628, 0 fail)/test:security/
test:integration (61, 0 fail)/build → hepsi yeşil. Canlıya dokunulmadı.

### Not
`tests/unit/**` LANE-QA'nın; testi **değiştirmedim**, yalnız kaynağı düzelterek
todo'yu yeşile çevirdim.

---

## Tur 14 — CV tarih/kutu hataları (#208, açık todo'lar) — PR #331

### Alınan issue
Kuyrukta `lane:urun` + `agent:handoff` etiketli **#208**. Kaynak benim
(`resume-parser.ts`); LANE-QA `tests/unit/resume-date-context.test.ts` içinde
**8 todo** pinlemiş, 4'ü hâlâ açık. Her birini gerçek parser ile önce/sonra ölçtüm.

### Düzeltilen 4 bulgu
1. **Adres → profil konumu.** `"adres"/"address"/"ikametgah"` location bölüm
   etiketiydi; `Adres: Lefkoşa - 2019` → `location="Lefkoşa - 2019"`. Kişisel
   veri oldukları için `ignoredSectionLabels`'a taşındı (`Location:`/`Konum:`
   gerçek konum etiketi kalır).
2. **Tabular `|` düzeni bitiş tarihini kaybediyordu.** `Acme | Dev | 2019 | 2023`
   → `location="| 2023"`, `endDate=""`. `|` tarih-aralığı ayırıcısı oldu; başlık
   tarih sıyrılmadan önce `|` üzerinde bölünüyor.
3. **"Devam ediyor" yarım.** `ongoingPattern`'de `devam` `devam ediyor`'dan önce
   listeliydi; regex ilk eşleşmeyi aldığı için `endDate="Devam"`, `location="ediyor"`.
   Uzun alternatif öne alındı.
4. **Gelecek tarih.** `2030 - 2035` kabul ediliyordu; artık **tümden atlanır**
   (`isValidYearRange` + `buildBlocks` erken `continue`). Geriye dönük/aşırı uzun
   aralık davranışı değişmedi.

### Devredilen (LANE-QA) — bayat assertion
`"an address line does not become the profile location"` testi ayrıca
`headline === "AHMET YILMAZ"` bekliyor. Bu, **iki yeşil sözleşmeyle çelişiyor**:
`"Alex Example\nalex@example.test"` ve `"Just a single short line"` **`{}`
döndürmeli**. Yani "adı headline yap" kuralı "tanınmayan serbest metinden
kategori uydurma" kuralını bozar; ikisini birlikte karşılamak bir **ürün kararı**
gerektirir. Kaynakta denedim, iki testi kırdı → geri aldım. Kararı LANE-QA'ya
bıraktım (PR gövdesi + QA yorumu).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (633, 0 fail)/test:security/
test:integration (61, 0 fail)/build → hepsi yeşil. Canlıya dokunulmadı.

### Not (kendime)
`git checkout -B <yeni> origin/main` **commit'lenmemiş** düzenlemeleri yine sildi;
bu turda düzenlemeleri tek tek yeniden uygulamak gerekti. Kural: branch açmadan
önce commit'le.

---

## Tur 15 — etiketsiz kişisel-veri satırı headline oluyordu (#339)

### Alınan issue
Kuyrukta `lane:urun` + `agent:handoff` etiketli **#339** (#208 kalıntısı;
LANE-QA buldu). Kaynak benim: `resume-parser.ts` `inferSections`.

### Doğrulanan kanıt (gerçek parser, önce → sonra)
```
["AHMET YILMAZ","1995-2000 doğumlu"]                 headline="1995-2000 doğumlu"  -> {}
["AHMET YILMAZ","Yazılım Geliştirici","1995 doğumlu"] description="1995 doğumlu"    -> headline="Yazılım Geliştirici"
["AHMET YILMAZ","Lefkoşa, Girne"]                    headline="Lefkoşa, Girne"     -> location="Lefkoşa, Girne"
["AHMET YILMAZ","Medeni Durum: Bekar"]               headline="Medeni Durum: Bekar"-> {}
```

### Kök neden
Etiketli satırlar (`Adres: …`) #331'de kapılanmıştı, **etiketsiz** olanlar değil;
`index === bodyStart` dalı ilk gövde satırını koşulsuz headline yapıyordu.

### Düzeltme
- `isPersonalDataLine` artık etiket ayrımı olmadan headline dalından **önce**.
- `medeni` (gövde) + `marital`/`cinsiyet`/`uyruk`/`ehliyet` eklendi — **yalnız
  kesin token'lar**; genel İngilizce sıfatlar (`single`, `married`) hariç
  (sıradan CV cümlesi düşmesin).
- `looksLikeDistrictList`: `"Lefkoşa, Girne"` headline değil **konum**.
- Doğum satırı artık deneyim açıklamasına da sızmıyor.

### Korunan sözleşmeler
`parseResumeText("Alex Example\nalex@example.test")` → `{}`,
`parseResumeText("Just a single short line")` → `{}`, ve gerçek unvan hâlâ
çıkarılıyor (`"Kıdemli Yazılım Geliştirici"` → headline, `"Girne"` → location).

### Kapılar
lint/typecheck/check:frontend-source/test:unit (647, 0 fail)/test:security/
test:integration (83, 0 fail)/build → hepsi yeşil. Canlıya dokunulmadı.

### Not (LANE-QA)
Issue'nun sözünü ettiği `todo` marker'ı (`"an unlabelled birth line does not
become the headline"`) `origin/main`'de **yoktu** (4 `todo` var, bu değil).
`tests/**` onların olduğu için eklemedim; kaynak düzeldiğine göre marker'ı
ekleyip yeşil raporlayabilirler. #208'in kalan bayat `headline` assertion'ı da
hâlâ onların kararında.

---

## Tur 16 — çok-ilçeli CV konumu profile hiç yazılmıyordu (#208, "az bilgi")

### Alınan iş
Açık `agent:backend` issue yoktu; #208'in "CV'den az bilgi çekiliyor" yarısından
en yüksek etkili, kendi dosyamdaki bulgu seçildi.

### Doğrulanan kanıt (gerçek modül, önce → sonra)
```
parseResumeText("AHMET YILMAZ\nGirne, Lefkoşa, Mağusa")  location="Girne, Lefkoşa, Mağusa"   (parser doğru)
mergeResumeDraft({location:""}, {location:"Girne, Lefkoşa, Mağusa"})
  önce: profile.location=""  added=0      sonra: profile.location="Girne"  added=1
```

### Kök neden
`resolveNorthernCyprusDistrict("Girne, Lefkoşa")` **null** döner (çok-ilçeli
dizge şirket adresinde tahmin edilmesin diye). `mergeResumeDraft` bu `null`'ı
"konum yok" sayıp atıyordu; profil şeması zaten tek ilçe tutuyor. Yani CV'nin
açıkça yazdığı konum kayboluyordu.

### Düzeltme
`resolveFirstDistrict`: önce tüm dizgeyi dener, olmazsa `[,;/|]+` ile bölüp ilk
çözülen ilçeyi alır (parser'ın `looksLikeDistrictList` ayırıcı kümesiyle aynı).
`current` ve `draft` konumunun ikisi de bu kuralla çözülür. `undefined` konum
için korumalı (`location` alanı opsiyonel olabiliyor — ilk denemede testler
`split of undefined` ile kırmızıya döndü, düzeltildi).

### Korunan sözleşmeler
- Tek ilçe (`"Girne"`) → `"Girne"`; bilinmeyen (`"Somewhere outside…"`) → `""`.
- `tests/unit/resume-profile-draft.test.ts` ve `tests/unit/resume-date-context.test.ts`
  (LANE-QA) yeşil kaldı — hiçbirine dokunulmadı.
- Yeni URUN testi: `src/features/candidates/resume-location-merge.test.ts`.

### Devredilen (LANE-QA) — **#367**
Açık bölüm başlığı altındaki kişisel-veri satırı hâlâ profile sızıyor
(`DENEYİM` altında `Telefon: …` → `description`; `EĞİTİM`/`SERTİFİKALAR`/
`DİLLER`/`BECERİLER` altında aynı). Kaynak benim ama düzeltme
`tests/unit/resume-date-context.test.ts:160`'ı kırıyor (o test satırın **tek
kayıt olarak hayatta kalmasını** sabitliyor); `tests/**` onların. Ayrıca naif
"PII kelimesi varsa satırı at" filtresi gerçek unvanları siliyor
(`"Adres Doğrulama Uzmanı"`, `"Telefon Satış Temsilcisi"`, `"Doğum Kliniği
Hemşiresi"`). Sınır kararı onlarda; `agent:handoff` + `lane:qa` ile #367 açıldı.

### Kapılar
lint/typecheck/check:frontend-source/test:unit (663, 0 fail) → hepsi yeşil.
Canlıya dokunulmadı.

### Not (kendime)
Bayat not: `resolveJobDateModified("garbage", P)` **artık** `P`'ye düşüyor
(dosya zaten korumalı); o bulgu geçersizdi.

