# İşBul KKTC — Frontend & Uygulama Katmanı Mikro-Seviye Röntgen ve Düzeltme Planı

Kaynak: salt-okunur denetim (src/ tüm dosyaları okunmuş, import grafiği taranmış, message katalogları karşılaştırılmış). Kod değişikliği **yok**; bu dosya yalnızca onay planıdır.

## Ön koşullar / varsayımlalar

- `requireAuthenticatedUser()` zaten mevcut: `src/server/dal/user.ts:157` (oturum yoksa `/login`'a yönlendirir).
- `resolveAuthDestination()` zaten mevcut: `src/app/[locale]/(auth)/login/page.tsx:70-115`'de kullanılıyor.
- `getCompanyJobForEdit`, `getCompanyApplicationDetail`, `getCandidateWorkspace`, `getAdminCompanyProfileReviewQueues`, `getEmployerWorkspace` DAL fonksiyonları zaten mevcut; yalnızca sayfa-katmanı guard eksik.
- Next.js 16 App Router: `error.tsx` / `global-error.tsx` hata sınırları istemci bileşeni olabilir (`useTranslations` kullanılabilir); `global-error.tsx` kökte (`src/app/`) bulunduğu için `[locale]` parametresini almaz — `lang` dinamikleştirmek burada sınırlıdır.
- `query.company` işveren ilan sayfalarında bir arama parametresidir (route segmenti değil).

## Faz 1 — Kritik Mantık / Kırık Link / Güvenlik

### 1.1 Sayfa katmanında eksik auth guard — korumalı sayfalara giriş açığı

| Dosya : Satır                                                                              | Bulgu                                                                                                                     | Kesin çözüm                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[locale]/(auth)/register/page.tsx`                                                | Giriş yapmış kullanıcının erişebildiği kayıt sayfası; hiç session kontrolü yok.                                           | Sayfa üstüne `requireAuthenticatedUser()` ekle; oturum varsa `resolveAuthDestination` ile panela yönlendir.                             |
| `src/app/[locale]/(auth)/forgot-password/page.tsx`                                         | Hiç session kontrolü yok.                                                                                                 | Oturum varsa login/panela yönlendiren guard ekle.                                                                                       |
| `src/app/[locale]/(auth)/reset-password/page.tsx:36-42`                                    | Kısmi: oturum yoksa `/forgot-password?error=expired`'a yönlendiriyor, ama oturum varsa sayfadan uzaklaştırılmıyor.        | Kimlik doğrulanmış kullanıcı için `reset-password` erişimini engelleyen guard ekle.                                                     |
| `src/app/[locale]/(company)/company/jobs/new/page.tsx`                                     | Sayfa katmanında session/rol kontrolü yok; `query.company` doğrulanmaz.                                                   | `requireAuthenticatedUser()` + `query.company` kullanıcının aktif şirket üyesi mi kontrol et; değilse 403/404.                          |
| `src/app/[locale]/(company)/company/jobs/page.tsx`                                         | Sayfa katmanında guard yok (yalnızca DAL).                                                                                | Sayfa düzeyinde `requireAuthenticatedUser()` ekle.                                                                                      |
| `src/app/[locale]/(company)/company/jobs/[jobId]/edit/page.tsx:27-32`                      | `getCompanyJobForEdit` yetkisiz erişimde hata fırlatır (500); `if (!job) notFound()` etkisiz kalır.                       | Sayfada `requireAuthenticatedUser()` + şirket üyelik kontrolü; yetkisiz erişimde `notFound()`/403 dön; `if (!job)`'u yürürlükte koru.   |
| `src/app/[locale]/(company)/company/dashboard/page.tsx`                                    | Sayfa katmanında guard yok (yalnızca DAL).                                                                                | Sayfa düzeyinde `requireAuthenticatedUser()` ekle.                                                                                      |
| `src/app/[locale]/(company)/company/dashboard/applications/[applicationId]/page.tsx:24-25` | `requireAuthenticatedUser()` var ama başvurunun şirket-sahipliği sayfa düzeyinde doğrulanmaz → cross-company okuma riski. | `getCompanyApplicationDetail` sonrası başvuru `company_id`'nin kullanıcının aktif şirketiyle eşleştiğini doğrula; değilse `notFound()`. |
| `src/app/[locale]/(candidate)/profile/dashboard/page.tsx:19`                               | Sayfa katmanında guard yok (yalnızca DAL `requireAuthenticatedUser`).                                                     | Sayfa düzeyinde guard ekle (yedek olarak DAL kalır).                                                                                    |
| `src/app/[locale]/(admin)/admin/company-profiles/page.tsx`                                 | Sayfa katmanında guard yok (yalnızca DAL `requirePlatformRole`).                                                          | Sayfa düzeyinde platform-admin guard ekle.                                                                                              |

### 1.2 Kırık link / yanlış locale / eksik target="\_blank"

- Kırık link: **yok** — tüm `<Link href=...>` mevcut rota haritasında.
- Yanlış-lokale (hardcoded `/tr/` vb.) href: **yok** — tüm Link ön eki yok, `next-intl` otomatik ekler.
- `router.push("/")` tek kullanım `src/features/identity/delete-account-button.tsx:33` — geçerli.
- `redirect()` hepsi `redirectLocalized` / `getLocalePrefix` ile locale-bilgilidir — öneksiz bare `redirect` yok.
- Dış linklerde `target="_blank" rel="noopener noreferrer` hepsinde mevcut.
- **Sonuç:** Faz 1'de link düzeltmesi gerekmez (doğrulandı).

## Faz 2 — Aday & İşveren UI/UX Yenileme

### 2.1 Aday Profili (`/profile/dashboard`) — eksik alan & boş durum

| Dosya : Satır                                                                    | Bulgu                                                                                                             | Kesin çözüm                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/features/candidates/schemas.ts:90-138` / `candidateProfileUpdateSchema:171` | `phone`, `jobTypePreference`, `workplaceModePreference`, `salaryExpectation`, `availability` alanları şemada yok. | Şemalara 5 eksik alanı ekle; DAL `candidate_profiles` yazımını ve `getCandidateWorkspace` okumasını genişlet. |
| `src/features/candidates/candidate-profile-form.tsx` (tüm dosya)                 | Formda telefon, çalışma şekli, iş yer şekli, maaş beklentisi, müsaitlik alanları yok.                             | Forma ilgili alanları ekle; `schemas.ts` ile eşçift tut.                                                      |
| `src/app/[locale]/(candidate)/profile/dashboard/page.tsx:156-172` / `:923-957`   | Boş profilde "henüz profiliniz yok" empty-state yok; form boş alanlarla açılıp `0/9` gösteriliyor.                | Tüm essential alanlar boş olduğunda ayrı empty-state kartı render et.                                         |
| `src/app/[locale]/(candidate)/applications/`                                     | Dizin sadece `.gitkeep`; aday `/applications` index rotası yok.                                                   | (İsteğe bağlı) aday başvuru listesi sayfası ekle — mevcut dashboard üzerinden gösterim yeterli sayılabilir.   |

### 2.2 İşveren & Admin — boş durum & mantık kopuklukları

| Dosya : Satır                                                         | Bulgu                                                                                                        | Kesin çözüm                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/app/[locale]/(company)/company/new/page.tsx`                     | Kullanıcının zaten bir şirketi olup olmadığı sayfa düzeyinde kontrol edilmez → tekrar kayıt denemesi mümkün. | Şirket sahibi üyeliği varsa `company/new`'ten `company/dashboard`'a yönlendir.   |
| `src/app/[locale]/(admin)/admin/content/page.tsx:143-148`             | Yasal belgeler bölümü `legalRows.length === 0` olduğunda empty-state mesajı yok (sadece sayı).               | Boş olduğunda empty-state ekle.                                                  |
| `src/app/[locale]/(company)/company/jobs/[jobId]/edit/page.tsx:31-32` | `getCompanyJobForEdit` yetkisizde 500 fırlatır; `notFound()` etkisiz.                                        | Faz 1'deki guard ile birlikte `try/catch` + `notFound()` veya DAL `null` dönüşü. |

### 2.3 Form doğrulama çelişkileri (istemci ↔ sunucu)

| Dosya : Satır                                                                            | Bulgu                                                                                                                              | Kesin çözüm                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/features/identity/new-password-form.tsx:78` / `src/features/identity/schemas.ts:73` | İstemci `confirmPassword` (`minLength 10`/`maxLength 128`) sunucu `updatePasswordSchema`'da yok; eşleşme sadece istemci tarafında. | `updatePasswordSchema`'ya `confirmPassword` ekle, `refine` ile sunucu tarafında zorla (veya istemciden çıkar). |
| `src/features/companies/actions.ts:239`                                                  | `reviewCompanyProfile` Zod şeması yerine satır içi regex/uzunluk kontrolü.                                                         | `schemas.ts`'te `reviewCompanyProfileSchema` tanımla, `safeParse` kullan.                                      |

### 2.4 Çift-gönderim (double-submit) koruması

| Dosya : Satır                                 | Bulgu                                                                 | Kesin çözüm                                                   |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/components/home/home-job-search.tsx:123` | `type="submit"` düğmesi `disabled={pending}` yok / bekleme state yok. | `pending`/`isLoading` state ekle, `disabled={pending}` bağla. |

### 2.5 Erişebilirlik / mobil taşma

- Input etiketli: hepsi `label htmlFor` veya örtük etiket — **bulgu yok**.
- `alt` eksik içeriksel görsel: **yok** (dekoratif `alt=""` kabul edilebilir).
- `div`/`span` `onClick`: **yok**, hepsi `button type="button"` / `<Link>`.
- Sabit genişlik `w-[...]` / `whitespace-nowrap` taşma riski: **yok** (yalnızca `button.tsx:7` paylaşılan sınıf, düşük risk).
- **Sonuç:** Faz 2'de a11y/mobil düzeltmesi gerekmez.

## Faz 3 — 6 Dil i18n & Ölü Kod Temizliği

### 3.1 Message katalog anahtarı karşılaştırması

- Tüm 6 dosya (`tr`, `en`, `ru`, `el`, `fa`, `de`) aynı key ağacına sahip; eksik/ekstra anahtar **yok**.
- Format-level farklar (Persian rakamlar `fa.json:1049,1052`, sayı gruplaması `fa.json:275,119`, çoğul kuralı `ru.json:947`) — i18n kütüphanesi tarafından yönetilir, anahtar eksikliği değil. **Düzeltme gerekmez.**

### 3.2 Hardcoded metin (i18n kullanılmadan doğrudan yazılmış)

| Dosya : Satır                                       | Bulgu                                               | Kesin çözüm                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/[locale]/error.tsx:28-36`                  | Hata sınırı içeriği hardcoded Türkçe (6 dilde yok). | `"use client"` ekle (zaten değilse), `useTranslations()` + `AppError.*` anahtarları (6 dile ekle).                                                       |
| `src/app/global-error.tsx:10-18`                    | Global hata UI hardcoded Türkçe; `lang="tr"` sabit. | `"use client"` (Next.js zorunludur), `useTranslations()` + anahtarlar (6 dile ekle); `lang` kökte olduğu için statik kalabilir (locale parametresi yok). |
| `src/components/layout/account-scene-media.tsx:23`  | `title: "Othello Kalesi"` hardcoded.                | `useTranslations()` + anahtar (6 dile ekle).                                                                                                             |
| `src/components/layout/account-scene-media.tsx:37`  | `title: "St. Hilarion Kalesi"` hardcoded.           | `useTranslations()` + anahtar (6 dile ekle).                                                                                                             |
| `src/components/layout/account-scene-media.tsx:51`  | `title: "Mavi Köşk"` hardcoded.                     | `useTranslations()` + anahtar (6 dile ekle).                                                                                                             |
| `src/components/layout/account-scene-media.tsx:157` | `<span>{video.title}</span>` doğrudan render.       | Video başlıklarını translation anahtarından al.                                                                                                          |
| `src/app/api/email/unsubscribe/route.ts:49`         | `<html lang="tr" dir="ltr">` hardcoded.             | `lang`/`dir` alıcı locale'a göre ayarla (confirm-marketing route.ts:63 örneğiyle aynı).                                                                  |

Not: `logo.tsx`, `packages-experience.tsx:134`, `editorial-form-page.tsx:59` içindeki "İşBul KKTC" marka adı — çevrilmez, düzeltme gerekmez. `home-job-search.tsx:31-38` district anahtarları kod tanımlayıcısı, kullanıcıya gösterilmez — düzeltme gerekmez.

### 3.3 RTL (`fa`) uyumu

- `src/i18n/routing.ts:41-43` `isRightToLeftLocale` sadece `'fa'` için true — doğru.
- `src/app/[locale]/layout.tsx:169` `dir={isRightToLeftLocale(locale) ? "rtl" : "ltr"}` — doğru.
- `src/app/api/email/confirm-marketing/route.ts:63` `rtl` doğru türetilmiş.
- `src/app/api/email/unsubscribe/route.ts:49` `dir="ltr"` hardcoded — 3.2'de listelenmiş, düzeltilecek.
- Fiziksel yön sınıfı (`ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`, `flex-row-reverse`, `left:`, `right:`) **hiçbiri bulunamadı** — RTL fiziksel-sınıf ihlali yok.

### 3.4 Ölü kod ve kullanılmayan bağımlılık

#### Orphan dosyalar (hiçbir yerden import edilmeyen)

Karar: **tümünü sil** (gerçekten ölü kod, gelecek özellik için ayrılmış değil). İstenirse her birinin içindeki mantık aynı anda yeniden yazılabilir, silme işlemi geri alınabilir (git).

| Dosya : Satır                                         | Bulgu                                                             | Kesin çözüm  |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| `src/lib/security/csp.ts:9`                           | `getScriptSrc`'ı çağıran import yok.                              | Dosyayı sil. |
| `src/features/companies/directory-import.ts:27`       | `importCompanyDirectory`/`companyEntriesFromCsv` çağıran yok.     | Dosyayı sil. |
| `src/features/jobs/source-job-fetchers.ts:23`         | `fetchIskibrisJobs`/`fetchIsbulkibrisJobs` çağıran yok.           | Dosyayı sil. |
| `src/features/jobs/iskibris-source-parser.ts:3`       | `parseIskibrisListingCards`/`parseIskibrisJobDetail` çağıran yok. | Dosyayı sil. |
| `src/features/candidates/resume-file-extractor.ts:13` | `extractResumeFile` çağıran yok.                                  | Dosyayı sil. |

#### Dosya içi kullanılmayan exportlar

| Dosya : Satır                | Bulgu                                                              | Kesin çözüm                               |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| `src/lib/seo.ts:29`          | `getLocalizedSocialImageAlt` sadece kendi dosyasında kullanılıyor. | Export'ı kaldır veya dışarıdan import et. |
| `src/lib/company-mark.ts:14` | `CompanyBrandTone` türü hiçbir dosya import etmiyor.               | Export'ı kaldır veya import eden yer bul. |
| `src/lib/company-mark.ts:83` | `companyBrandTone` sadece kendi dosyasında kullanılıyor.           | Export'ı kaldır veya dışarıdan import et. |

#### Kopya (duplicate) yardımcı

| Dosya 1 : Satır                               | Dosya 2 : Satır                               | Bulgu                                         | Kesin çözüm                                                                                    |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/components/home/home-job-search.tsx:206` | `src/components/jobs/jobs-experience.tsx:300` | `buildSearchHref` iki yerde aynı tanımlanmış. | Tek paylaşılan util'a (`@/lib/utils` veya yeni dosya) tekilleştir, her ikisinden de import et. |

#### Kullanılmayan paketler (`package.json`)

| Dosya : Satır      | Paket             | Kesin çözüm                                                                                           |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `package.json:92`  | `@playwright/cli` | devDependencies'dan kaldır (kodda import yok).                                                        |
| `package.json:106` | `supabase`        | devDependencies'dan kaldır (`@supabase/supabase-js` ve `@supabase/ssr` kullanılıyor, `supabase` yok). |
| `package.json:103` | `pg`              | devDependencies'dan kaldır (`@types/pg` var ama `pg` import edilmiyor).                               |

## Uygulama sırası ve doğrulama

1. Faz 1 (güvenlik/auth guard) → `bun run typecheck`, `bun run lint`, `bun run check:frontend-source`.
2. Faz 2 (UI/UX, form çelişkileri, boş durum) → `bun run typecheck`, `bun run lint`, `bun run test:unit`.
3. Faz 3 (i18n hardcoded metin, ölü kod, kullanılmayan paketler) → `bun run typecheck`, `bun run lint`, `bun run check:frontend-source`.

`test:db` ve `test:e2e` altyapı gerektirir; Docker/Supabase local unavailable olduğu sürece bu kutular işaretlenmez. Tüm düzeltmeler bu plan dosyası üzerinden onay sonrası bir implementation-capable agent tarafından uygulanır.

## Açık karar (onay bekleniyor)

**Ölü kod: silmek mi, ayıklayıp saklamak mı?** Önerim: 5 orphan dosya, 3 kullanılmayan export, 3 kullanılmayan paket ve 1 kopya yardımcı tamamen silinsin (kod da ölü, transfer etmeye değer bağımsız bir varlık yok). Onay verildi Faz 3'te uygulanır; onay verilmezse bu maddeler plan dışı bırakılır.

1. Orphan Dosyaları ve Paketleri Silmeden Önce Test/Script Kontrolü (Tuzak #1):
   • Planda supabase paketini package.json'dan silmeyi önermiş — KESİNLİKLE SİLİNMEMELİ! Çünkü bun run db:start ve bun run test:db yerel Supabase CLI'yı node_modules/.bin/supabase üzerinden çalıştırır; silinirse veritabanı komutları bozulur.
   • Ayrıca src/lib/security/csp.ts, directory-import.ts, source-job-fetchers.ts, iskibris-source-parser.ts, resume-file-extractor.ts dosyalarını silmeden önce tests/ ve scripts/ klasörlerinde import edilip edilmedikleri kontrol edilmeli; testlerde kullanılıyorsa silinmemeli!
2. global-error.tsx İçinde useTranslations() Tuzağı (Tuzak #2):
   • Planda src/app/global-error.tsx içine useTranslations() eklemeyi önermiş — YAPILMAMALI! Çünkü global-error.tsx, kök NextIntlClientProvider çöktüğünde render edilir; içinde useTranslations() çağrılırsa kendi de çöker ve beyaz ekran verir. Onun yerine 6 dil için hafif statik bir sözlük objesi kullanmalı.
3. Aday Profili 5 Yeni Alan (phone, jobTypePreference, workplaceModePreference, salaryExpectation, availability) İçin DB Bağımlılığı (Tuzak #3):
   • Bu 5 alan şu an Supabase candidate_profiles tablosunda sütun olarak yoksa, önce veritabanı migrasyonu yapılmadan frontend'de kaydedilmeye çalışılırsa Supabase column does not exist hatası verir! Bu yüzden bu 5 alanı önce Supabase Veritabanı Denetim Planı ile birlikte SQL sütunu olarak ekleyip, ardından frontend formuna bağlamalıyız.
4. Sayfa Auth Guard'larında Mevcut Akışı Kırmama (Tuzak #4):
   • register/page.tsx ve forgot-password/page.tsx sayfalarına requireAuthenticatedUser() koyulursa giriş yapmamış yeni kullanıcılar kayıt olamaz! Bu iki sayfada oturum yoksa sayfayı göster, oturum varsa panele yönlendir mantığı kullanılmalı (requireAuthenticatedUser() değil!).
