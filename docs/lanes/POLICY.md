# Lane politikası — kaç lane, ne zaman

Lane sayısı bir hedef değil, bir sonuçtur. Bu dosya sayıyı neyin belirlediğini
yazar; ölçüme dayanır, tercihe değil.

## Sayıyı belirleyen iki şey

1. **Ayrık alan sayısı.** Bir dosyanın tek sahibi olur. Yeni lane ancak
   sahipsiz, gerçek bir alan varsa eklenir. Sahiplik tablosu (00-orchestration)
   10 lane tanımlar; bu bir *haritadır*, aynı anda çalışacak sayı değil.
2. **CI verimi.** Her PR ~7 dakika CI harcar ve 6 job açar. Aynı anda 10 lane
   PR üretirse 60 runner kuyruğa girer; 2026-11-04'te bu bir run'ı 24 dakikaya
   çıkardı. Yani eşzamanlılık arttıkça **bekleme** artar.

## Uygulama

- **Tanım:** 10 lane, her zaman. Sahiplik haritası sabittir.
- **Eşzamanlı çalışma:** dalga başına **4–6 lane**. Bu, CI'ı doyurmadan
  verimi en yüksek tutan aralıktır.
- **Bir lane ancak somut, sınırlı bir işi varsa başlatılır.** "Her şeyi denetle"
  görevi gürültü üretir: 2026-11-04'te `geo` 1.4M token harcayıp sınırlı iş
  bulamadı ve durdu; `guvenlik` 15.6M token harcayıp gerçek bir açık buldu.
  Fark görevdeydi, lane'de değil.
- **Biten lane duraklatılır.** PR'ı merge edilen lane'in sandbox'ı kapatılır.

## Kanıt (2026-11-04 ilk dalga)

| Lane | Token | Çıktı |
|---|---|---|
| guvenlik | 15.6M | PR #100 — 808 satır güvenlik katmanı, **gerçek açık** (issue #108) |
| tasarim | 14.4M | PR #106 — a11y düzeltmesi |
| seo | 14.0M | PR #105 — hreflang/sitemap düzeltmesi |
| urun | 11.8M | PR #99 — slug döngüsü + HTML entity çökmesi |
| auth | 9.1M | PR #98 — auth audience hatası |
| qa | 4.0M | PR yok — sınırlı iş verilmemişti |
| geo | 1.4M | PR yok — sınırlı iş verilmemişti |

7 lane'den 5'i PR üretti, 4'ü merge edildi. Sınırlı işi olan her lane üretti;
olmayan ikisi durdu. Politika bu ayrımı kalıcılaştırır.

## Dalga planı

- **Dalga 0:** tasarim, seo, geo, auth, urun, qa, guvenlik (kod tarafı)
- **Dalga 1:** supabase (tek canlı DB yazarı) — diğerleri PR akışını
  kanıtladıktan sonra
- **Dalga 2:** cloudflare (token yetkileri netleşince)
