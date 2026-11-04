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
