# Performans, erişilebilirlik ve yük bütçesi

## V4 kabul hedefleri

Alan verisi mevcutsa Core Web Vitals 75. yüzdelikte:

| Ölçüm | Hedef | Kanıt ve istisna |
|---|---:|---|
| LCP | ≤ 2,5 sn | Hedef kullanıcı ve gerçek cihaz alan verisi |
| INP | ≤ 200 ms | Ana iş akışlarında alan verisi |
| CLS | ≤ 0,1 | Mobil/masaüstü görsel akış |

Bunlar **hedeftir, ölçüm sonucu değildir**. Başlangıç build'i, ziyaretçi
telemetrisi ve hedef cihaz profili ölçülmeden kesin JavaScript, görsel veya
shader KB/sınırı iddia edilmez; kararlaştırılmış sınır ADR'de saklanır.

## Ana sayfa görsel yükü (ölçüldü)

Ana sayfanın ilk yüklemesinde indirilen görseller, 10 görsel (6 şehir slaytı +
4 öne çıkan sektör kartı):

| Kalite | DPR 1 | DPR 2 |
|---|---:|---:|
| `quality={100}` (eski) | 5,50 MB | 7,25 MB |
| `quality={90}` (yeni) | ~3,1 MB | ~4,1 MB |

Kalite 90, 1920px'te altı orijinal üzerinde ölçüldü: PSNR 42,6-45,6 dB,
SSIM 0,987-0,997 (görsel olarak ayırt edilemez eşiği ~40 dB / 0,98), bayt
~%43 daha az. AVIF bu Next sürümünde (16.4.2) kaliteyi 50/80 ile ölçekleyip
effort 3'te kodladığı için WebP'nin gerisinde kalır; `formats: ["image/webp"]`
korunur. Ayrıntılı tablo ve gerekçe: `docs/design/frontend-design-review.md`
ve `scripts/check-frontend-source.mjs` içindeki `homepageImageQuality`.

## Temel işlevler için kurallar

- Semantik HTML, sunucuda üretilmiş temel içerik ve kullanıcıya göre yetkili
  veri sunumu ilk işlevsel ekranı oluşturur. İş arama, başvuru, erişilebilir
  gezinme ve ödeme statüsü hiçbir zaman canvas ya da WebGPU yüklenmesini beklemez.
- Başlangıç paketine 3D kütüphanesini/sahnelerini gereksiz yere dahil etme;
  sahne ve varlıkları uygun rota/cihaz için client-side lazy-load et.
- `prefers-reduced-motion` durumunda otomatik kamera/scroll hareketini kapat
  veya azalt; kullanıcının açıkça başlattığı tek seferlik deneyim animasyonunu
  koru. Sekme veya sahne görünüm dışına çıkınca RAF/render durur; sahne yeniden
  görünür olduğunda çizim devam eder. Paket deneyiminde canvas piksel oranı
  masaüstünde en fazla 1.35, dokunmatik/küçük ekranda 1.15 ile sınırlandırılır.
  Render hatası DOM akışını bozmadan statik/DOM fallback'e iner.
- Düşük kapasiteli mobil cihazı ve kısıtlı mobil ağı gerçek Playwright
  cihaz/şebeke profiliyle sınar. Form gönderimi, doğrulama, upload ve ödeme
  hatası açıkça gösterilir; gönderilmiş veri kaybolmaz ve bekleyici sonsuza
  uzamaz.
- Ham Blender/FBX/8K kaynaklar build ve kullanıcı trafiğinin dışında
  `assets-src/` altında kalır. GLB/Meshopt işlemini kaynak ve hedefi farklı
  girdilerle yap. Gerçek KTX2 üretimi KTX-Software `ktx` CLI gerektirir;
  ölçülmüş, desteklenen decoder ile birlikte devreye alınır.
- PostgreSQL araması full-text indeksi ve yayımlanmış/süresi dolmamış iş
  koşuluyla çalışır; request başına bütün indeksi bellekte kurma. Ayrı arama
  servisi ancak sorgu gecikmesi/özelliği ölçüldükten sonra ADR ile eklenir.

## Ölçülecek test matrisleri

- Mobil/dizüstü: ilk içerik, iş arama/filtre, profil ve form yanıtı.
- 3D kapalı, desteklenmeyen WebGPU, WebGL hata, prefers-reduced-motion ve
  gizli sekme.
- Yayında/draft/expired ilan sorgusu ve indeks planı, gerçekçi test verisinde.
- Desktop/mobile Lighthouse veya eşdeğer ölçüm + alan verisi; giriş yapmış
  kullanıcı sayfalarında CLS/caching kontrolleri.

Her sahne için kabul: kare hızı/cihaz tier'ı, render loop/visibility davranışı,
yükleme boyutu, kamera+scroll eğrisi ve mobil fallback sonucu.
`docs/scenes/` içinde doğrulanmış ölçüm ve test donanımına ait karar dosyası
bulunana kadar sayısal sahne sınırı tanımlı değildir.
