# Micro-denetim protokolü

Bir lane'in görevi "bir bug düzeltmek" değil, **sahip olduğu alanı dosya dosya,
satır satır denetlemek** ve bulduğu her eksiği kanıtıyla kapatmaktır. Bu dosya
hangi boyutların kontrol edileceğini tanımlar.

## Nasıl çalışılır

1. **Envanter çıkar.** Sahip olduğun her dosyayı listele:
   `git ls-files '<glob>' | sort`
2. **Dosya dosya ilerle.** Her dosya için aşağıdaki boyutları tek tek sor.
   Atladığın dosyayı raporda "bakılmadı" olarak işaretle — sessizce geçme.
3. **Bulguyu kanıtla.** Her bulgu için: dosya:satır, gözlenen, beklenen, etki.
   "Olabilir" değil, "şu girdi şu çıktıyı verdi".
4. **Düzelt veya devret.** Kendi dosyansa düzelt + test ekle. Başkasının
   dosyasıysa issue aç (`agent:blocked`), kanıtı koy.
5. **Rapor.** Bulguları tablo hâlinde PR'a yaz. Sıfır bulgu da bir sonuçtur,
   ama "şu N dosyaya bakıldı" demeden.

## Boyutlar

### Ortak (her lane)

- **Doğruluk:** sınır girdiler (boş, çok uzun, yanlış tip, unicode) doğru işleniyor mu?
- **Hata yolu:** hata sessizce yutuluyor mu? Kullanıcı/çağıran görüyor mu?
- **Tutarlılık:** aynı işi yapan iki yer aynı sonucu veriyor mu?
- **Ölü kod:** kullanılmayan export, ulaşılamayan dal, artık import.
- **Yorum:** yorum kodun söylediğini mi tekrar ediyor, yoksa gerçekten
  sezgi-dışı bir şeyi mi açıklıyor? (Tekrar edeni sil.)

### Frontend (`src/components`, `src/styles`, `src/experience`)

- Erişilebilirlik: her etkileşimli öğenin erişilebilir adı **görünen metni içeriyor** mu (WCAG 2.5.3)?
- Kontrast: token'lar WCAG eşiğini geçiyor mu? Yeni ham hex var mı?
- Klavye: Tab sırası, odak halkası, Escape ile kapanma, tuzak odak.
- RTL: `fa` yönü bozuluyor mu? Mantıksal özellikler (`margin-inline`) kullanılıyor mu?
- Hareket: `prefers-reduced-motion` saygı görüyor mu?
- Duyarlı: 320px'de taşma, 200% zoom'da kırılma.
- Durumlar: yükleniyor / boş / hata / kısmi veri — hepsi gerçek mi?

### Backend (`src/server`, `src/features`, `supabase`)

- Girdi doğrulama sınırda mı, yoksa içeride mi?
- Yetki: her action oturum + rol kontrolü yapıyor mu? Başkasının kaydı erişilebilir mi?
- Yarış durumu: çift gönderim, eşzamanlı güncelleme, idempotency.
- İşlem (transaction): kısmi başarı mümkün mü?
- Sızıntı: hata mesajı/log PII veya sır taşıyor mu?
- Sorgu: N+1, eksik indeks, sınırsız `select`.

### Güvenlik (`tests/security`, tehdit modeli)

- Yetki sınırı: `anon`/`authenticated` erişmemesi gereken her tablo/RPC kapalı mı?
- `SECURITY DEFINER` fonksiyonlarda `search_path` sabit mi?
- Yönlendirme: `next`/`redirect`/`returnTo` parametreleri açık yönlendirmeye kapalı mı?
- İstemci sınırı: hiçbir istemci modülü `@/server/**` veya `NEXT_PUBLIC_` olmayan env okumuyor mu?
- Kimlik: oturum sabitleme, çerez bayrakları, MFA atlatma, hesap devralma.
- Girdi: SQL enjeksiyonu, yol manipülasyonu, dosya yükleme, CSRF.

### SEO meta (`src/app/[locale]/**`, seo.ts, sitemap, robots)

- Her rota + her dil için: benzersiz `title`, benzersiz `description`.
- Canonical **mutlak string** mi? (`URL` instance base sanılır — bilinen tuzak.)
- `hreflang`: her dil kendine + `x-default` doğru mu? Çevrilen slug'lar çözülüyor mu?
- `robots.txt`: `noindex` sayfaları `Disallow` **etmiyor** mu?
- Sitemap: ölü `<loc>` yok, `<lastmod>` doğru, `revalidate` mantıklı.
- OG/Twitter kartı: her rota için görsel doğru mu, 1200×630 mu?

### GEO (`src/content`, `llms.txt`, JSON-LD üreticileri)

- `llms.txt` / `llms-full.txt` siteyi doğru anlatıyor mu, güncel mi?
- JSON-LD: `JobPosting`, `Organization`, `BreadcrumbList`, `WebSite`+`SearchAction` tam mı?
- JSON-LD görünen içerikle **uyuşuyor** mu (yapısal veri ile sayfa metni)?
- Yerel varlık: bölge/ilçe adları tutarlı mı, AI motorları için net mi?
- AI görünürlük: soru-cevap formatı, özet paragraflar, kaynak atıfları.

### Link bütünlüğü (`linkler`)

- **İç bağlantı:** her sayfa anlamlı iç bağlantı veriyor mu, yetim sayfa var mı?
- **Kırık bağlantı:** her `href` gerçek bir rotaya/dosyaya gidiyor mu?
- **Dış bağlantı:** `target="_blank"` + `rel="noopener noreferrer"` var mı?
- **Yönlendirme zinciri:** gereksiz 301/302 zinciri, döngü.
- **Anchor metni:** "buraya tıkla" gibi boş metin yerine anlamlı metin.
- **Backlink stratejisi:** paylaşılabilir/kalıcı URL'ler, canonical ile tutarlılık.

### Mantık (`logic`)

- Koşullar: ters çevrilebilir mi, `off-by-one`, boş dizi/`null` durumu.
- Tarih/saat: saat dilimi, DST, "bugün" tanımı.
- Para/sayı: yuvarlama, kayan nokta, sıfıra bölme.
- Sıralama: kararlı mı, eşitlikte ne oluyor?
- Durum makinesi: ulaşılamayan durum, kaçış olmayan döngü.

## Rapor formatı (PR gövdesine)

```
## Denetlenen dosyalar
git ls-files '<glob>' -> N dosya, hepsine bakıldı (veya: şu M dosyaya bakılmadı)

## Bulgular
| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | src/x.ts:42 | mantık | ... | ... | ... | düzeltildi |

## Düzeltilen / devredilen
- Düzeltildi: ...
- Devredildi: #<issue> (sahibi LANE-X)

## Kapılar
lint/typecheck/gate/unit -> sonuç
```
