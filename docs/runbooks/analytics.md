# Runbook: Google Analytics (GA4) kurulumu

Bu runbook, GA4 ölçümünün üretimde nasıl açıldığını ve bozulduğunda nasıl
teşhis edileceğini tanımlar. Ölçüm kimliği **kaynak koda gömülmez**; ortam
değişkeninden okunur.

## Mimari (kod tarafı hazır)

- Bileşen: `src/components/analytics/google-analytics-consent.tsx`
- Mount: `src/app/[locale]/layout.tsx` (`<GoogleAnalyticsConsent />`)
- CSP izinleri: `next.config.ts` → `script-src`/`connect-src` içinde
  `www.googletagmanager.com` ve `www.google-analytics.com` zaten var.
- Ortam değişkeni: `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`.env.example`'da belgeli).

Etiket **yalnızca** `NEXT_PUBLIC_GA_MEASUREMENT_ID` geçerli bir `G-XXXXXXXX`
biçimindeyse **ve** ziyaretçi çerez banner'ında analitik iznini verdiyse yüklenir.
Bu bilinçli bir gizlilik kararıdır (KVKK/GDPR). Sonuç: `gtag.js` **ham HTML'de
asla görünmez**, çünkü istemci tarafında onaydan sonra enjekte edilir.

## Kurulum (üretim)

`NEXT_PUBLIC_*` değişkenleri **derleme anında** koda gömülür; bu yüzden sadece
değişkeni eklemek yetmez, yeniden dağıtım şarttır.

1. Vercel → proje → **Settings → Environment Variables**.
2. Ekle: `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX`
   (GA4 → Yönetici → Veri akışları → web akışı → Ölçüm Kimliği).
3. Ortam olarak **Production** (gerekirse **Preview** de) işaretle → Save.
4. **Deployments → Redeploy** (değişken ancak yeni bir derlemede koda girer).
5. Doğrula (aşağıya bak).

> Ölçüm kimliği gizli bir anahtar değildir, sayfa kaynağında görünür. Yine de
> tek doğru yer ortam değişkenidir; koda sabitlemeyin.

## Doğrulama

Ham HTML'de etiket **aramayın** — onay olmadan yüklenmez. Tarayıcıyla doğrulayın:

1. `https://isbulkktc.com` aç.
2. Çerez banner'ında **"Tümünü Kabul Et"** de.
3. Konsol: `typeof window.gtag` → `"function"` olmalı.
4. `document.querySelector('script[src*="googletagmanager"]')` → `src` içinde
   `id=G-XXXXXXXXXX` görünmeli.
5. GA4 → **Raporlar → Gerçek zamanlı**: kendi oturumun görünmeli.

Otomatik kapı: `tests/e2e/analytics.spec.ts` bu akışı (onay → `gtag` yüklenmesi)
doğrular ve kimlik yokken `test.skip` ile sessizce geçer.

## "Google etiketiniz algılanmadı" uyarısı

Google'ın etiket algılama aracı ham HTML'i tarar; etiketimiz onaydan sonra
yüklendiği için o ekran **her zaman** "algılanmadı" der. Bu bir hata değildir.
Yukarıdaki tarayıcı doğrulamasını (özellikle Gerçek zamanlı rapor) tek doğru
kabul edin. GA4 kurulum sihirbazındaki "Manuel olarak yükle" adımı opsiyoneldir;
atlayabilirsiniz.

## Sık karşılaşılan sorunlar

| Belirti | Neden | Çözüm |
|---|---|---|
| Ham HTML'de `gtag` yok | Tasarım gereği (onay öncesi yüklenmez) | Tarayıcıda onay verip doğrula |
| Onaydan sonra da `gtag` yok | `NEXT_PUBLIC_GA_MEASUREMENT_ID` üretimde tanımsız | Env ekle + redeploy |
| Env tanımlı ama etiket yok | Redeploy yapılmadı (derleme-anı gömme) | Yeniden dağıt |
| Konsol CSP ihlali | CSP'den googletagmanager çıkarılmış | `next.config.ts` `script-src` kontrol |
| Gerçek zamanlı boş | Reklam engelleyici / izin verilmedi | Engelleyici kapat, izin ver |
| Kimlik `G-` ile başlamıyor | Geçersiz değer | `/^G-[A-Z0-9]+$/` testi başarısız olur, doğru kimliği gir |

## Kapsam dışı

GA etiketi **arama sıralamasını etkilemez**. "Google'da çıkmıyor" şikâyeti GA ile
ilgili değildir; indeksleme için Search Console → Sitemaps ve URL Denetimi'ne
bakın.
