# Paralel lane charter — isbulkktc kalite programı

Bu klasör, siteyi **her yönden mikro düzeyde zirveye** çıkarmak için paralel
çalışan chat'lerin (lane'lerin) sözleşmesidir. Her chat **kendi konteynerinde,
kendi klonunda** çalışır — dosya çakışması fiziksel olarak olmaz — ama ortak iki
kaynağı paylaşırlar: **canlı Supabase** ve **`main` branch**.

## Lane'ler

| # | Lane | Görev | Canlıya dokunur? | Dalga |
|---|---|---|---|---|
| 0 | [orchestration](00-orchestration.md) | kurallar, sahiplik, sıra | — | — |
| 1 | [supabase](01-supabase.md) | şema, RLS, indeks, pgTAP | ✅ **tek DB yazarı** | 1 |
| 2 | [cloudflare](02-cloudflare.md) | WAF/cache/DNS/SSL/bot denetimi | ✅ CF API | 2 |
| 3 | [seo](03-seo.md) | sitemap, canonical, hreflang, OG, route metadata | ❌ | 0 |
| 4 | [geo](04-geo.md) | llms.txt, yerel entity, AI görünürlük, JSON-LD üreticisi | ❌ | 0 |
| 5 | [tasarim](05-tasarim.md) | UI/UX, motion, erişilebilirlik, guard'lar | ❌ | 0 |
| 6 | [auth](06-auth.md) | oturum akışı, e-posta şablonları, güvenlik | ❌ | 0 |

## Üç değişmez kural

1. **`main`'e asla push/merge yok.** Her lane `lane/<ad>` branch'ini `origin/main`'den
   açar, PR açar, açık bırakır. Merge = sahibin kararı.
2. **Canlı Supabase'e aynı anda SADECE BİR lane yazar** (LANE-SUPABASE). Diğerleri
   SQL'i branch'te taşır, canlıya uygulamaz.
3. **Bir dosyanın TEK sahibi olur.** Sahibi olmadığın dosyayı düzenleme; ihtiyacı
   kendi `docs/lanes/<ad>.md` dosyana TODO yaz. Detay: [00-orchestration](00-orchestration.md).

## Her chat'e ilk mesaj (kopyala-yapıştır)

```
isbulkktc reposunda paralel "lane" programında çalışacaksın.
Önce şu iki dosyayı OKU: docs/lanes/00-orchestration.md ve docs/lanes/<SENİN-LANE>.md
Ayrıca AGENTS.md'yi oku. Sonra kendi lane'inin görevini uygula.
Kurallar: main'e push YOK, kendi branch'in (lane/<ad>) + PR açık bırak;
canlı Supabase'e yazma (tek yazar LANE-SUPABASE'dir); sadece sahibi olduğun
dosyalara yaz; CI'ı (lint, typecheck, check:frontend-source, test:unit) yeşile getir.
Rapor formatı docs/lanes/00-orchestration.md sonunda.
```

`<SENİN-LANE>` yerine: `01-supabase`, `02-cloudflare`, `03-seo`, `04-geo`,
`05-tasarim`, `06-auth`.

## Sıra

- **Dalga 0 (hemen, paralel):** tasarim, seo, geo, auth
- **Dalga 1:** supabase (tek DB yazarı)
- **Dalga 2:** cloudflare (token yazma yetkileri netleşince)

## Neden bu ayrım

Bir çakışma gerçekten bulundu: JSON-LD (`WebSite`, `SearchAction`, `JobPosting`)
`src/app/[locale]/layout.tsx` ve `jobs/[slug]/page.tsx` içinde üretiliyor — hem
görsel JSX hem yapısal veri aynı dosyada. Çözüm: **route/layout dosyaları SEO'nun**,
**JSON-LD üretici modülleri GEO'nun**. Böylece iki lane aynı dosyaya dokunmaz.
