# LANE-PAZARLAMA — tanıtım ve dönüşüm e-postaları

İşletmelere ve adaylara **sitenin değerini anlatan**, ilgi çeken, harekete
geçiren e-posta serileri. Transactional (kayıt, şifre, başvuru) **bu lane'in
değil** — onlar LANE-AUTH ve LANE-URUN'da.

## Neden ayrı lane

Pazarlama e-postası farklı bir uzmanlıktır:

| Transactional | Pazarlama |
|---|---|
| Kullanıcı **bekliyor** | Kullanıcı **beklemiyor** |
| Amaç: bilgilendir | Amaç: **dönüştür** |
| İtibar riski düşük | İtibar riski **yüksek** (şikayet = spam) |
| Tek mesaj | **Seri** (zamanlama, sıra, segment) |

Karıştırılırsa ikisi de bozulur. Ayrı sahiplik, ayrı ölçüm.

## Sahip olduğun yollar (AYRIK — mevcut dosyalara dokunmaz)

`src/features/campaigns/**`, `supabase/functions/_shared/campaign-*.ts`,
`docs/campaigns/**`

**Dokunmadığın yollar:** `supabase/functions/_shared/email-layout.ts`,
`email-render.ts`, `supabase/templates/**` (AUTH/URUN), `src/messages/**` (İÇERİK).
Kabuk ve metin **onlardan** gelir; sen **seriyi** kurarsın.

## Değişmez kurallar

1. **Rıza (consent) zorunlu.** Pazarlama maili yalnız açık izin verene gider.
   İzinsiz gönderim = spam şikayeti = alan adı itibarı çöker.
2. **Tek tıkla çıkış.** `List-Unsubscribe` + `List-Unsubscribe-Post:
   List-Unsubscribe=One-Click`. Gmail şartı.
3. **Gönderim sıklığı sınırlı.** Kişi başına haftada en fazla 1-2. Sınırı kodda tut.
4. **Segment.** Aday ve işveren farklı mesaj alır. Aynı metni ikisine gönderme.
5. **Ölç.** Açılma, tıklama, çıkış, şikayet. Ölçülmeyen seri iyileşmez.
6. **Isınma (warm-up).** Yeni domain → düşük hacimle başla, kademeli artır.
7. **6 dil.** Metin İÇERİK'ten gelir; sen yalnız yapıyı kurarsın.

## Yasak

- İzinsiz toplu gönderim
- Yanıltıcı konu satırı ("Re:", "Fwd:", sahte aciliyet)
- Satın alınmış liste
- Tek e-postada birden çok CTA
- Görsel ağırlıklı, metinsiz e-posta (spam skoru)

## Seri tasarımı (işveren — B2B, sahibin önceliği)

| # | Zaman | Amaç | İçerik |
|---|---|---|---|
| 1 | Gün 0 | Tanıt | İşBul KKTC nedir, işverene ne kazandırır |
| 2 | Gün 3 | Değer | Kaç aday, hangi sektör, örnek ilan performansı |
| 3 | Gün 7 | Kanıt | Vaka/rakam, "X firma Y günde Z başvuru aldı" |
| 4 | Gün 14 | Eylem | Paket özeti + net CTA ("İlan ver") |
| 5 | Gün 21 | Hatırlatma | Farklı açı; sonra seriyi bitir |

**Kural:** 5 mesajdan sonra dur. Israrcı seri şikayet üretir.

## Kabul ölçütü
- Her mesajda rıza kaydı ve tek tıkla çıkış
- Segment ayrımı çalışıyor (aday ≠ işveren)
- Ölçüm kaydediliyor (gönderim/açılma/tıklama/çıkış/şikayet)
- Seri 5 mesajda bitiyor
- LANE-VERIFY teslim + spam skorunu doğruluyor (#187)
