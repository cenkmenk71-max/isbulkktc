# Plan: GitHub'a tüm yerel değişiklikleri push et ve main'e merge et

## Durum
- Yerel branch: `sync/local-main-on-origin-main-20261122`
- Remote: `cenkmenk71-max/isbulkktc` (main) — GitHub yazma erişimi doğrulandı (test branch açıldı)
- Değişiklik sayısı: ~200 (staged + unstaged + untracked)
- Bash salt-okunur → `git push`, `git merge`, `git checkout`, `bun run ...` çalıştırılamıyor

## Kısıtlamalar
- Yerel git komutları (push/merge/checkout) engellenmiştir.
- `bun run typecheck / lint / test:security` çalıştırılamıyor; bu adımları kullanıcı yerel olarak çalıştırmalı.
- GitHub API üzerinden dosya içerikli push (`github_push_files`) tek commit'te çoklu dosya ekleyebilir ancak **dosya silme**yi desteklemez; silinen dosyalar ayrı işlemle silinmelidir.

## Görevler

### 1. Feature branch aç
- `kilo-push-20261123` branch'ini `main`'den aç.
- Bu branch main'i bozmaz; PR üzerinden merge edilir.

### 2. Değişiklikleri GitHub'a aktar
- Staged + unstaged dosyaların içeriğini yerel çalışma ağacından oku.
- `github_push_files` ile `kilo-push-20261123`'e tek commit olarak yükle.
- Silinen dosyalar (2 candidate/company form + 12 test-output marketing e-postası) GitHub'da tek tek silinmelidir (API delete endpoint veya PR açıp main'de sil).
- Untracked dosyalar (`.kilo/plans/...`, `.kilo/skills/`, `src/components/forms/`, `*-v2.tsx`, `tr-lowercase.ts`, migration SQL, `email-marketing-urls.test.ts`) da içeriğiyle birlikte yüklenmeli.

### 3. Pull Request aç
- PR: `kilo-push-20261123` → `main`
- Başlık: `feat: push all local changes (~200 files) — review before merge`
- Açıklamada dosya sayısı ve silinen dosyalar listelenmeli.

### 4. Merge
- PR onaylandıktan sonra main'e merge (squash veya merge commit).
- Merge sonrası feature branch'i silinebilir.

### 5. Doğrulama (kullanıcı yerel olarak)
- `bun run typecheck` — sıfır hata
- `bun run lint` — sıfır hata
- `bun run test:security` — sıfır hata
- Başarılıysa sadece sonra `bun run check:frontend-source`, `bun run test:unit`, `bun run build` + e2e, `bun run test:db`

## Açık sorular
- Hangi dosyalar aslında push edilmeli? (Tüm staged/unstaged/untracked mı, yoksa seçik mi?)
- Silinen dosyalar geri getirilsin mi yoksa silinmesin mi?
- PR draft mı hazır mı açılsın?

## Rollback
- PR merge edilmezse main etkilenmez.
- Feature branch silinirse geri alınamaz (main'de kalır).