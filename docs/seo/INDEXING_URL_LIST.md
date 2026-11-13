# GSC Dizinleme (Indexing) — Kopyala-Yapıştır URL Listesi

Bu dosya, `https://isbulkktc.com/sitemap.xml` içindeki **183 URL'nin tamamını**
öncelik sırasına göre listeler. Amaç: Google Search Console'da **URL Inspection →
"Dizine eklenmesini iste"** işini kolayca yapmak.

> Kaynak: canlı sitemap (183 URL). CSV karşılığı: `docs/seo/indexing-urls.csv`
> (öncelik, kategori, dil, GSC durumu ve notlar için boş kolonlarla — takip edilebilir).

---

## 1. Önce şunu anla: URL Inspection ≠ Sitemap

| İş | Ne yapar | Kapsam | Ne sıklıkla |
|---|---|---|---|
| **Sitemaps** (GSC → Sitemaps) | Google'a "bu 183 URL'yi tara" der | **Toplu (183)** | **Bir kez** gönder, yeter |
| **URL Inspection** (üstteki arama kutusu) | Tek URL'yi sorgular + öncelikli tarama kuyruğuna sokar | **Tek URL** | Sadece **en önemli** sayfalar |

**Kritik:** URL Inspection'a toplu yapıştırma YOK. 183 URL'yi tek tek girmen gerekir.
Bu yüzden:

1. **Sitemap'i gönder** (tek sefer): GSC → **Sitemaps** → `sitemap.xml` → Gönder.
2. **URL Inspection**'ı sadece aşağıdaki **P0 + seçili P1** sayfalar için kullan.

Google "dizine ekleme isteği" kotası yaklaşık **günde 10–15 URL**. Hepsini aynı gün
zorlama; aşağıdaki **3 günlük plana** göre ilerle.

---

## 2. ⚠️ Bilinmesi gerekenler (tekrar eden hatalar)

- **`/en/jobs/<slug>` ilanları 404 + noindex.** Sitemap'te bilinçli olarak YOK.
  Bu URL'leri girme; girersen "Bulunamadı (404)" görürsün — bu beklenen, hata değil.
- **Dizinleme = otorite + zaman.** Yeni alan adı (kayıt: 2026-09-19) için normal süre
  3–6 ay. "Dizine ekle" isteği **tarama hızını** artırır, **sıralamayı garanti etmez**.
- **Kanıtlanmış durum:** teknik indeksleme engeli YOK (bkz. `SEO_IMPLEMENTATION_REPORT.md`
  §46–§49). Sorun teknik değil, alan adı yaşı + otorite.
- Her istek sonrası GSC "dizinlenmiş mi" sonucu **anında gelmez**; 1–7 gün bekle.

---

## 3. GÜN 1 — P0: Para sayfaları (16 URL)

Bunlar sitenin asıl trafik/sıralama hedefleri. **Bugün hepsini gir.**

### 3.1 Ana sayfa + ilan listesi + ana hub'lar

```
https://isbulkktc.com/
https://isbulkktc.com/jobs
https://isbulkktc.com/companies
https://isbulkktc.com/freelance
https://isbulkktc.com/packages
https://isbulkktc.com/blog
https://isbulkktc.com/rehber
https://isbulkktc.com/sss
https://isbulkktc.com/is-ilanlari/girne
https://isbulkktc.com/is-ilanlari/guzelyurt
https://isbulkktc.com/is-ilanlari/iskele
https://isbulkktc.com/is-ilanlari/lefkosa
https://isbulkktc.com/is-ilanlari/magusa
https://isbulkktc.com/is-turleri/serbest-calisma
https://isbulkktc.com/is-turleri/staj
https://isbulkktc.com/is-turleri/tam-zamanli
```

*(Yukarıdaki blok: ana sayfa, /jobs, /companies, /freelance, /packages,
/rehber, /blog, /sss, 5 şehir sayfası ve 3 iş türü sayfası.)*

---

## 4. GÜN 2 — İçerik: rehber + blog (Türkçe, 6 URL)

### 4.1 Rehber yazıları (3)

```
https://isbulkktc.com/rehber/kktc-calisma-izni-ve-haklar
https://isbulkktc.com/rehber/kktc-cv-hazirlama-rehberi
https://isbulkktc.com/rehber/kktc-is-bulma-rehberi
```

### 4.2 Blog yazıları (3)

```
https://isbulkktc.com/blog/kktc-is-piyasasi-guncel-gorunum
https://isbulkktc.com/blog/kktc-isverenler-icin-ilan-rehberi
https://isbulkktc.com/blog/kktc-yeni-mezun-is-arama
```

---

## 5. GÜN 3 — İlan sayfaları (Türkçe, 21 URL)

En güncel ilanlar. Google günlük kotayı aşarsan **kalanını ertesi güne** bırak;
ilanlar zamanla eskir, o yüzden P0/P1 içerikten SONRA gelir.

```
https://isbulkktc.com/jobs/source-isbulkibris-ekskavator-operatoru
https://isbulkktc.com/jobs/source-isbulkibris-musteri-kabul-on-muhsebe-satis-temsilcisi
https://isbulkktc.com/jobs/source-iskibris-dagitimci
https://isbulkktc.com/jobs/source-iskibris-front-desk-agent-on-buro-gorevlisi
https://isbulkktc.com/jobs/source-iskibris-girne-bolgesi-magaza-satis-personeli
https://isbulkktc.com/jobs/source-iskibris-idari-isler-satin-alma-sorumlusu
https://isbulkktc.com/jobs/source-iskibris-insaat-muhendisi
https://isbulkktc.com/jobs/source-iskibris-insan-kaynaklari-sorumlusu
https://isbulkktc.com/jobs/source-iskibris-kimyasal-uretim-personeli
https://isbulkktc.com/jobs/source-iskibris-magaza-personeli
https://isbulkktc.com/jobs/source-iskibris-magaza-satis-temsilcisi
https://isbulkktc.com/jobs/source-iskibris-musteri-kabul-on-muhsebe-satis-temsilcisi
https://isbulkktc.com/jobs/source-iskibris-on-buro-vardiya-sorumlusu
https://isbulkktc.com/jobs/source-iskibris-satin-alma-sorumlusu
https://isbulkktc.com/jobs/source-iskibris-satis-pazarlama-personeli
https://isbulkktc.com/jobs/source-iskibris-satis-personeli
https://isbulkktc.com/jobs/source-iskibris-sekreter-diger
https://isbulkktc.com/jobs/source-iskibris-ticari-pazarlama-yoneticisi
https://isbulkktc.com/jobs/source-iskibris-uluslararasi-ofis-temsilcisi
https://isbulkktc.com/jobs/source-iskibris-yazilim-destek-uzmani
https://isbulkktc.com/jobs/source-iskibris-yonetici-asistani
```

---

## 6. Diğer diller — dil ana sayfaları (5 URL, P1)

İngilizce/Rusça/Yunanca/Farsça/Almanca ana sayfalar. Türkçe işler bittikten sonra.

```
https://isbulkktc.com/de
https://isbulkktc.com/el
https://isbulkktc.com/en
https://isbulkktc.com/fa
https://isbulkktc.com/ru
```

---

## 7. Düşük öncelik — P2/P3 (Yasal sayfalar, 30 URL)

`/about`, `/contact`, `/cookies`, `/terms`, `/privacy` — **Türkçe dahil**.
Sıralama getirmez; **en sona** bırak. Gerekirse hiç yapma, sitemap halleder.

```
https://isbulkktc.com/about
https://isbulkktc.com/contact
https://isbulkktc.com/cookies
https://isbulkktc.com/privacy
https://isbulkktc.com/terms
```

> Diğer dillerdeki yasal sayfalar (25 URL) **P3** — CSV'de listeli, öncelik verme.

---

## 8. Takip

`docs/seo/indexing-urls.csv` dosyasını aç, her satırdaki **`gsc_durum`** ve
**`indexlendi`** kolonlarını doldur:

- `gsc_durum`: `istendi` / `dizinlendi` / `hariç tutuldu` / `tarandı-ama-dizinlenmedi`
- `indexlendi`: `evet` / `hayır`
- `notlar`: kısa not (ör. "sitemap'te bulundu ama dizinlenmedi")

Haftada bir GSC → **Pages (Sayfalar)** raporunu CSV indir, `indexlendi` kolonuyla karşılaştır.

---

## 9. Özet tablo

| Öncelik | Kategori | Adet | Ne zaman |
|---|---|---|---|
| **P0** | Ana sayfa, hub'lar, şehir/iş türü (TR) | 16 | Gün 1 |
| **P1** | Rehber + blog (TR) | 6 | Gün 2 |
| **P1** | İlanlar (TR) | 21 | Gün 3 |
| **P1** | Dil ana sayfaları | 5 | Sonra |
| **P1** | Diğer dillerdeki hub/rehber/blog/şehir | ~106 | Sonra (opsiyonel) |
| **P2** | Yasal sayfalar (TR) | 5 | En son |
| **P3** | Yasal sayfalar (diğer diller) | 25 | Gerekmez |
| | **TOPLAM** | **183** | |
