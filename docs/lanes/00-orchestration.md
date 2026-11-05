# Lane orchestration — isbulkktc "top seviye" programı

Her lane = **ayrı bir Agent Canvas chat'i** (kendi sandbox'ı, kendi klonu).
Bu dosya kuralları ve sırayı tanımlar. Bir lane'in brief'i `docs/lanes/<ad>.md`'de.

## Değişmez kurallar (her lane)

1. **`main`'e asla push/merge yok.** Her lane kendi branch'ini açar, PR açar. Merge = sahibin kararı.
2. **Canlı Supabase'e aynı anda SADECE BİR lane yazar.** DB yazan tek lane: **LANE-SUPABASE**.
   Diğer lane'ler SQL'i branch'te/migration taslağı olarak taşır, canlıya uygulamaz.
3. **Her lane ayrık dosya setine sahiptir.** Aynı dosyaya iki lane dokunmaz.
4. **Her lane CI'ı yeşile getirir** (lint, typecheck, check:frontend-source, test:unit; ilgiliyse build/e2e).
5. **Her lane notlarını `docs/lanes/<ad>.md`'ye yazar** — ortak `MEMORY.md`'ye değil (çakışma olmasın).
6. **Kod/PR'dan önce `git status -sb`** ve kendi branch'inde çalış.
7. Gizli anahtar/şifre commit'lenmez; `.env.local` gitignored kalır.

## Kaynak sahipliği (çakışma olmasın diye)

> **Tek kural: bir dosyanın TEK sahibi olur. Bir lane, sahibi olmadığı dosyayı
> DÜZENLEMEZ — ihtiyacı varsa rapor eder (TODO) ve dosya sahibi uygular.**
> `git commit` öncesi `git status` bak: kendi sahiplik listende olmayan dosya
> kirliyse commit'leme (başka lane'in işidir).

| Lane | Sahip olduğu yollar (SADECE bunlara yazar) |
|---|---|
| LANE-SUPABASE | `supabase/**` (migrations, tests, seed, config.toml), `docs/lanes/01-supabase.md` |
| LANE-CLOUDFLARE | repo dosyası YOK (CF API); isterse `docs/cloudflare.md`, `docs/lanes/02-cloudflare.md` |
| LANE-SEO | `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/[locale]/**`, `docs/lanes/03-seo.md` |
| LANE-GEO | `src/content/**`, `src/app/llms.txt/**`, `public/llms*`, `src/features/**/structured-data*.ts`, `src/features/jobs/job-posting-structured-data.ts`, `docs/lanes/04-geo.md` |
| LANE-TASARIM | `src/components/**`, `src/experience/**`, `src/styles/**`, `src/assets/**`, `tests/e2e/accessibility.spec.ts`, `tests/unit/design-tokens.test.ts`, `tests/unit/design-token-drift.baseline.json`, `docs/lanes/05-tasarim.md` |
| LANE-AUTH | `src/features/identity/**`, `src/app/[locale]/(auth)/**`, `supabase/templates/**`, `docs/lanes/06-auth.md` |
| LANE-URUN | `src/features/**`, `!src/features/identity/**`, `!src/features/**/structured-data*.ts`, `!src/features/jobs/job-posting-structured-data.ts`, `src/server/config/**`, `src/server/push/**`, `src/lib/analytics/**`, `src/lib/pwa/**`, `docs/lanes/07-urun.md` |
| LANE-QA | `tests/**`, `!tests/e2e/accessibility.spec.ts`, `!tests/unit/design-tokens.test.ts`, `!tests/unit/design-token-drift.baseline.json`, `!tests/security/**`, `docs/performance-budget.md`, `docs/lanes/08-qa.md` |
| LANE-GÜVENLİK | `tests/security/**`, `docs/threat-model.md`, `docs/data-retention.md`, `docs/lanes/09-guvenlik.md` |
| LANE-INFRA | `.github/**`, `scripts/**`, `package.json`, `bun.lock`, `docs/lanes/00-orchestration.md`, `docs/lanes/README.md` |

**Her lane kendi brief'ine sahiptir.** Protokol "notlarını `docs/lanes/<ad>.md`'ye
yaz" der; o dosya o lane'in çalışma alanıdır, başkası dokunmaz.

**Dışlama sözdizimi:** bir glob `!` ile başlıyorsa o yol o lane'in **dışındadır**.
Sıra önemlidir: önce dahil edilenler, sonra dışlananlar uygulanır. Yukarıdaki
`LANE-URUN` satırı "tüm `src/features/**`, ama identity ve structured-data
hariç" demektir. Dedektör (`scripts/lane-collisions.mjs`) bu sözdizimini anlar.

**Neden dışlama gerekti:** `src/features/jobs/job-posting-structured-data.ts`
hem URUN'un dizininde hem GEO'nun modülünde; `tests/e2e/accessibility.spec.ts`
hem QA'nın katmanında hem TASARIM'ın guard'ında. Dizin düzeyinde sahiplik bu iki
dosyada örtüşüyordu — dışlama bunu kesin biçimde çözer.

### Lane → skill eşlemesi

Her lane işini yaparken kendi uzmanlık skill'ini kullanır. Skill'ler
`.agents/skills/` altındadır (OpenHands extensions reposundan kuruldu, tarandı).

| Lane | Skill'ler |
|---|---|
| LANE-TASARIM | `frontend-design` (özgün, üretim kalitesinde UI), `code-simplifier` |
| LANE-SEO / LANE-GEO | `evidence-based-citations` (iddiaları resmî kaynakla bağla) |
| LANE-SUPABASE / LANE-AUTH / LANE-GÜVENLİK | `security` (güvenli kodlama, yetkilendirme, veri koruma) |
| LANE-CLOUDFLARE | `security` |
| LANE-URUN | `code-review`, `qa-changes`, `code-simplifier` |
| LANE-QA | `qa-changes` (PR'ı işlevsel doğrula), `code-review` |
| LANE-INFRA | `github-actions` (workflow kur/debug et) |
| Her lane (PR öncesi) | `code-review`, `qa-changes` |
| PR'a yorum yazarken | `github-pr-review` |
| Sadeleştirme turunda | `code-simplifier` |

`code-review` ve `qa-changes` her lane'in **tanım-bitti** kapısının parçasıdır:
PR açmadan önce değişikliği kendi başına gözden geçir, çalıştır, sonucu raporla.

### Çakışma çözümü (ÖNEMLİ)
- **`src/app/[locale]/layout.tsx` ve `jobs/[slug]/page.tsx` içinde hem görsel JSX
  hem JSON-LD var.** Bu dosyaların sahibi **LANE-SEO**'dur. Görsel/JSX
  değişikliği gerekiyorsa TASARIM rapor eder; JSON-LD şekli gerekiyorsa GEO
  **üretici modülü** (`src/features/**/structured-data*.ts`) düzenler, mount'u SEO
  uygular. İki lane aynı route dosyasını asla aynı anda düzenlemez.
- `supabase/templates/**` içerik = **AUTH**; `supabase/config.toml` = **SUPABASE**.
- `llms.txt` mount (`src/app/llms.txt/route.ts`) = **GEO**; sitemap/robots = **SEO**.

## Lane başlatma (her chat'in ilk adımı)

```bash
git fetch origin
git checkout -b lane/<ad> origin/main     # main'den başla, başka lane'in branch'inden DEĞİL
git status -sb                            # kirli dosya varsa dokunma
```

- Bu dokümanı ve `AGENTS.md`'yi **oku**. Notlarını yalnızca kendi
  `docs/lanes/<ad>.md` dosyana yaz (index'e yazarsan 6 lane çakışır).
- PR açmadan önce `git fetch origin && git rebase origin/main`.
- Merge = sahibin kararı; sen PR'ı açık bırak.


## Sıra (dalga dalga)

- **Dalga 0 (bloklamayan, hemen):** LANE-TASARIM, LANE-SEO, LANE-GEO, LANE-AUTH (kod tarafı)
- **Dalga 1:** LANE-SUPABASE (tek DB yazarı; migration + pgTAP)
- **Dalga 2:** LANE-CLOUDFLARE (token yetkileri netleşince)

## Her lane'in rapor formatı

```
Lane: <ad>            Branch: <branch>            PR: <link>
Değişen dosyalar: ...
Çalıştırılan kontroller: lint/typecheck/gate/unit/e2e -> sonuç
Canlıya dokundu mu: hayır / evet (ne yaptı)
Sahibin yapması gerekenler: ...
Sonraki lane için notlar: ...
```
