# Plan: 3 Katmanlı Kurumsal CV Ayrıştırma Mimarisi (uygulama hazırı)

## Hedef
Mevcut kural tabanlı CV ayrıştırıcısının yanına, ücretsiz API katmanlarını (Gemini + Groq) birleştiren ve erişilemezlik durumunda yerel kural tabanlı parse'a düşen bir **3 katmanlı sunucu tarafı** CV ayrıştırma katmanı eklemek. Ayrıştırılan veriler aday profil formunda önizlenir; aday düzenler ve onayladıktan sonra `saveCandidateProfile` ile Supabase `public.candidate_profiles` tablosuna yazılır. Kod henüz yazılmayacak; bu dosya yürütülebilir bir uygulama planıdır.

## Mevcut durum (inceleme sonucu)

| Bileşen | Dosya | Rol |
|---|---|---|
| Kural tabanlı parser (Katman 3) | `src/features/candidates/resume-parser.ts` | `parseResumeText` → `CandidateResumeDraft`. Değişiklik yok, referans kullanılır. |
| İstemci dosya çıkarma | `src/features/candidates/resume-file-extractor.ts` (`"use client"`) | pdfjs/mammoth/rtf/odt metin çıkarma. Anahtar okumaz, istemcide kalır. |
| Taslak birleştirme | `src/features/candidates/resume-profile-draft.ts` | `mergeResumeDraft` — form verileriyle import draft'ını birleştirir (önizleme akışı). |
| Form | `src/features/candidates/candidate-profile-form.tsx` (`"use client"`) | `useActionState(saveCandidateProfile)`. Dosya seçimi şu an istemci parse ediyor; sunucu action'a taşınacak. |
| Şemalar | `src/features/candidates/schemas.ts` | `candidateProfileSchema`, `candidateProfileUpdateSchema`. Tipler: `headline`, `location`, `skills`, `experience`, `education`, `languages`, `certifications`, `summary`, `links`. `location`: `z.enum(northernCyprusDistrictValues).nullable()`. |
| Sunucu action | `src/features/candidates/actions.ts` | `saveCandidateProfile` — şema doğrulama, `candidate_profiles` upsert, `profiles.display_name` güncelleme, e-posta. Davranışı aynı kalır. |
| Sunucu AI örneği | `src/server/ai/cv-synthesis.ts` | `import "server-only"`, Groq raw `fetch`, `json_schema`. Yeni parser için şablon. |
| Veritabanı | `supabase/migrations/...candidate_profiles...` | `headline ≤140`, `location ≤120` (6 KKTC ilçesi CHECK: Lefkoşa/Mağusa/Girne/Güzelyurt/İskele/Lefke), `skills text[] ≤40`, `experience/education/languages/certifications/links jsonb` (`is_valid_candidate_profile_section`), `summary ≤2000`. RLS + `authenticated` sütun grantı. |
| KKTC ilçeler | `src/features/locations/northern-cyprus-districts.ts` | `resolveNorthernCyprusDistrict()` → 6 ilçe veya null. Alias: "gazimagusa"→Mağusa, "lefkosa"→Lefkoşa. Türkiye şehirleri → null. |
| Güvenlik testleri | `tests/security/client-boundary.test.ts` | İstemci modül non-public `process.env` okumaz; `src/server/**` gizli env okuyan modül `import "server-only"` ile işaretli; `NEXT_PUBLIC_*` gizli ad olmaz. `check-frontend-source.mjs`: `getCurrentUser`, `safeParse`, `candidate_profiles` upsert, `profiles.display_name`, `visibility` yazılmaması assertion'ları korunur. |

## Kritik kararlar (uygulamaya girdi)

1. **Tüm API anahtarı okuması ve API çağrıları sunucu tarafında.** Yeni modüller `src/server/ai/` altında, `import "server-only"` ile. İstemci sadece dosyayı action'a gönderir; anahtar hiçbir zaman istemciye sızmaz.
2. **Girdi kanalı:** mevcut `candidate-profile-form.tsx` dosya seçimi → yeni Server Action (`importResumeFile`) → 3 katmanlı parse → Zod doğrulanmış draft → form alanlarına önizlenir → aday düzenler → `saveCandidateProfile` ile Supabase'e kaydet (onay = kaydetme eylemi). `saveCandidateProfile` ve `check-frontend-source` assertion'ları korunur.
3. **API çağrıları raw `fetch` ile** (`cv-synthesis.ts` ile tutarlı, yeni bağımlılık eklenmez): Gemini `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (PDF `inlineData` base64; DOCX temiz metin), Groq `api.groq.com/openai/v1/chat/completions` (`response_format: { type: "json_schema", json_schema: { strict: true } }`).
4. **Katman 3** mevcut `parseResumeText`'i sunucu tarafından çağırır (env okumaz, import güvenli).
5. **Zod şeması** `candidateProfileSchema` ile %100 eşleşir: `headline`, `location` (6 ilçe enum), `skills`, `experience[]`, `education[]`, `languages[]` (proficiency enum), `certifications[]`, `summary`, `links[]` (+ geçici `cvFullText`). Uzunluklar DB/TS sınırlarıyla aynı. Tarih `YYYY[-MM]` deseninde.
6. **DB şeması değişmez** — yeni migration/pgTAP gerekmez. `candidate_profiles` mevcut sütunlara sığar.
7. **Sistem yordamı Türkçe:** iki sütunlu/tablo CV'lerde sütun karıştırması yok; yazım/bozuk Türkçe karakter/tarih (`YYYY-MM`) düzeltme; Lefkosa→Lefkoşa, Magusa→Gazimağusa gibi KKTC/Türkiye şehir standartlaştırması; sıfır halüsinasyon (belgede olmayan = `null` / `[]`).
8. **Konum null-normalizasyonu:** Parser'dan dönen konum `resolveNorthernCyprusDistrict` ile çözümlenir; 6 KKTC ilçesi dışındaysa (örn. Türkiye şehri) `null`'a indirgenir. Bu hem `check-frontend-source.mjs`'teki `visibility`/`candidate_profiles` assertion'larını bozmamak için hem de DB CHECK hatasını önlemek için zorunludur. `mergeResumeDraft` içinde `resolveFirstDistrict` zaten bunu yapar (`null` → `""` → Zod transform ile `null`).
9. **Server Action boyut sınırı:** `next.config.ts`'ta `experimental.serverActions.bodySizeLimit` şu an yok (Next.js default 1 MB). 5 MB PDF yüklemesi için en az `'6mb'` olarak ayarlanmalı (mevcut `agentUpgrade: "security"` ile birleştirilecek).

## Görevler (sıralı)

T1. **Ortam değişkenleri** — `.env.example` eklenir (gerçek değer işlenmez):
   - `GEMINI_API_KEY=` (sunucu tarafı)
   - `GEMINI_CV_MODEL=gemini-2.5-flash`
   - `GROQ_API_KEY=` (sunucu tarafı)
   - `GROQ_CV_MODEL=llama-3.3-70b-versatile`
   Hepsi `NEXT_PUBLIC_` olmadan; güvenlik notu eklenir.

T2. **Next.js server action boyut sınırı** — `next.config.ts` `experimental` nesnesine `serverActions: { bodySizeLimit: '6mb' }` eklenir (mevcut `agentUpgrade: "security"` ile aynı nesne içinde). 5 MB PDF yüklemesi için.

T3. **Sunucu tarafı metin çıkarıcısı** — `src/server/ai/cv-text-extractor.ts` (`import "server-only"`):
   - DOCX → mammoth; PDF → pdfjs-dist (Groq/yerel katman fallback metni için); txt/rtf/odt mevcut mantığa uygun.
   - 5 MB dosya / 25 sayfa / 80k karakter sınırları, mevcut `DocumentImportErrorCode` kodlarıyla uyumlu.

T4. **Katı Zod CV şeması** — `src/server/ai/cv-zod-schema.ts`:
   - `candidateProfileSchema` ile %100 eşleşen strict Zod şeması + infer tipleri.
   - `location` = 6 KKTC ilçesi enum; `proficiency` = Native/C2/C1/B2/B1/A2/A1; tarih `^\d{4}(-\d{2})?$`; diziler `[]` veya `null` Yoksa boş dizi.

T5. **3 katmanlı ayrıştırıcı** — `src/server/ai/cv-parser.ts` (`import "server-only"`):
   - Katman 1 Gemini: `GEMINI_API_KEY` varsa PDF `inlineData` (base64, native), DOCX temiz metin; strict JSON schema yanıtı.
   - Katman 2 Groq: anahtar yoksa veya HTTP 429/5xx → sunucu tarafı çıkarılan metin, `json_schema` strict.
   - Katman 3: iki dış API erişilemezse mevcut `parseResumeText` (yerel garanti).
   - Türkçe sistem yordamı: sütun karışmazlığı, yazım/Türkçe karakter/tarih düzeltme, şehir standartlaştırması, sıfır halüsinasyon (`null`/`[]`).
   - Tüm katmanın çıktısı T4 şemasıyla doğrulanır; hata/yoksa `null` alanları, uydurma yok.

T6. **Server Action entegrasyonu** — `src/features/candidates/ai-resume-actions.ts`:
   - `importResumeFile(file)` action'u: `cv-parser.ts`'ı çağırır, draft'ı döner, istemciye seri hale getirilebilir hata kodları (`unsupported`, `tooLarge`, `tooManyPages`, `empty`, `unreadable`, `parseFailed`).
   - API anahtarları asla yanıta dahil edilmez.

T7. **Form önizleme/onay akışı** — `src/features/candidates/candidate-profile-form.tsx`:
   - `handleResumeFile`: istemci tarafı `extractResumeFile` yerine `importResumeFile` action'u çağırılır.
   - Dönen draft `mergeResumeDraft` ile form alanlarına doldurulur (önizleme); konum `resolveNorthernCyprusDistrict` ile çözülür, 6 ilçe dışı → `null` (form'da `""` olarak gösterilir, kaydı null).
   - Aday düzenler; "Kaydet" → `saveCandidateProfile` → Supabase `candidate_profiles` (mevcut davranış).

T8. **Testler** (yeni dosyalar, synthetic fixture):
   - `tests/unit/cv-zod-schema.test.ts`: geçerli/geçersiz girişler, tüm form+DB alanı, uzunluk ve enum sınırları.
   - `tests/unit/cv-parser.test.ts`: mock `fetch` ile katman yönlendirme (anahtar yok → Groq; 429/5xx → Groq; ikisi de yok/başarısız → yerel parser), sistem yordamı davranışları (null alan, şehir normalizasyonu, sütun karışmazlığı).
   - Mevcut `tests/unit/resume-parser.test.ts` ve bölüm testleri sadece katman 3 Referans olarak kalır, değiştirilmez.

T9. **Doğrulama** (tam çıkışı incele, 0 hata):
   - `bun run lint`
   - `bun run typecheck`
   - `bun run check:frontend-source`
   - `bun run test:unit`
   - `bun run test:security` (özellikle `client-boundary`: yeni anahtarların istemciye sızması yok, `src/server/ai/*` modülleri `server-only` ile işaretli)
   - `bun run test:db` ve `bun run test:e2e` DB/E2E akışı etkilemez (şema değişikliği yok) — infra yoksa bildir, geç sayılmaz.

## Riskler ve koruyucular

- `GEMINI_API_KEY` / `GROQ_API_KEY` istemci bundle'ına sızıp `client-boundary` veya `check-frontend-source` testini bozabilir: `NEXT_PUBLIC_` ön eki yok, `"use client"` modüllerinden import edilmemeli.
- Zod şeması ile DB `is_valid_candidate_profile_section` CHECK'leri (izinli alanlar, en fazla 12 giriş, alan uzunlukları) ve `location` 6-ilçe sınırı arasında tutarsızlık riski: T4'te eşleştirme T7 ile aynı kalacak şekilde sabitlenir.
- Gemini `inlineData` PDF boyutu/MIME: mevcut 5 MB dosya limitiyle sınırlı.
- API anahtarları/çıktılar asla `console.error`/`console.log` ile loglanmaz (log-safety).
- Konum 6 KKTC ilçesi dışındaysa DB CHECK hatası: `resolveNorthernCyprusDistrict` → null, Zod transform `""` → null, kaydı null. CHECK `location is null` nedeniyle geçer.

## Açık soru / kapsam dışı

- Mevcut `src/server/ai/cv-synthesis.ts`'taki `CV_AI_API_KEY`/`CV_AI_MODEL` (CV özeti sentezi) bu kapsamda **değiştirilmez**; yeni parser anahtarlarıyla ayrı kalır.
- Route Handler yerine **Server Action** seçildi (form zaten `useActionState(saveCandidateProfile)` ile çalışıyor). Route Handler tercih edilirse `src/app/api/cv/parse/route.ts` (`dynamic: 'force-dynamic'`, `Cache-Control: no-store`) aynı `cv-parser.ts` katmanını çağırır.

## Başarı ölçütü
`bun run lint`, `bun run typecheck`, `bun run check:frontend-source`, `bun run test:unit`, `bun run test:security` sırasıyla 0 hata tamamlanır ve formdan CV import → önizleme → aday onayı → Supabase kaydı akışı çalışır.