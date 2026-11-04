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
