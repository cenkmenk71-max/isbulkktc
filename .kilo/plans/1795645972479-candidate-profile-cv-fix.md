# Plan: Aday Profil Sayfası ve CV İçe Aktarma Düzeltmesi

## Hedef
İşBul KKTC aday profil sayfasını tam profesyonel ve tam işlevsel hale getirmek. CV/PDF yükleme ile çıkarılebilen tüm bilgiler doğru forma yazılsın; CV'de olmayan alan (uyruk, adres vb.) boş kalsın, kullanıcı manuel doldursun. Mevcut AI tabanlı mimari korunur, zayıf noktaları düzeltilir.

## Kararlar (final)

1. **Mimari:** Var olan 3-tier AI fallback korunur (Gemini PDF bytes → Groq Vision taranmış PDF → Groq metin → yerel kural parser son çare). Sıfırdan sistem kurulmaz.
2. **Strategi:** Merge. Mevcut profil verisi korunur, CV'den gelen yeni bilgiler eklenir. Tekrarlar `normalize + "|"` anahtarıyla engellenir (`resume-profile-draft.ts:61-95`). Tek alanlar (headline, location, summary) mevcut değer varsa mevcut değer kazanır (`resume-profile-draft.ts:121-126`). `revertToInitial` ile geri alınabilir.
3. **Kısmi çıkarma:** Çıkan alanlar forma doldurulur, çıkmayan alanlar boş kalır (kullanıcı manuel doldurur). Çıkan alan listesi: headline, location, skills, experience, education, languages, certifications, summary, links.
4. **Etki alanı:** Sadece profil/CV dosyaları değişir. İş ilanları, işveren, auth, email, support chat gibi başka hiçbir özellik koduna müdahale yok.
5. **UI temizliği:** Duplicate revert butonu tekilleştirilir. Kullanıcıya gösterilmeyecek teknik mesajlar (sunucu/Gemini/Groq/saklama açıklamaları) kaldırılır veya sadeleştirilir.

## Bilinen riskler (kod tespiti)

- `cv-parser-core.ts:500`: Groq Vision sadece `!text.trim()` olduğunda denenir. Kısmi metin çıkarsa Groq Vision atlanır — "sadece 1 alan" sorununun muhtemel nedeni.
- `candidate-profile-form.tsx:795-806` ve `:1527-1536`: Aynı `revertToInitial` fonksiyonunu çağıran iki adet geri al butonu (tam duplicate).
- `tr.json:1175-1198` ve `:1625-1648`: İki `resumeImport` çeviri bloğu var; her ikisinde de sunucu/Gemini/Groq/saklama teknik açıklamaları var.

## Sıralı görevler

### Görev 1 — CV çıkarma fallback'ini sağlamlaştır
Dosya: `src/server/ai/cv-parser-core.ts`
- `parseResumeWithFallback`: her sağlayıcıya ayrı ayrı dene; biri hata verirse bir sonrakine geç; hepsi başarısızsa yerel parser çalışır
- Groq Vision koşulunu (`!text.trim()`) genişlet: metin kısalıyorsa (az alan çıkarıldı) da Groq Vision denenebilir; veya en azından hata durumunda fallback zinciri tam çalışmalı
- Yerel parser sonucu boşsa (hiç alan çıkamazsa) `null` dön
- Logging ekle: hangi sağlayıcı denendi, hangi durum döndü, kaç alan çıkarıldı
- `hasOutputContent` kısmi sonuç kabul etmeye devam eder (1 alan bile yeterli)

### Görev 2 — Yerel parser bölüm tespitini genişlet
Dosya: `src/features/candidates/resume-parser.ts`
- `sectionLabels` listesini genişlet (TR/EN/RU/EL/FA/DE + diğer yaygın diller)
- Başlıksız satırların doğru bölüme atan inference mantığını iyileştir (isim/konum/beceri/tecrube/eğitim ayırımı)
- Türkçe karakterli başlıklar (`İş Deneyimi`, `Eğitim`, `Yetenekler`, `Diller`, `Sertifikalar`) doğru eşleşsin

### Görev 3 — Import sonucunu detaylandır
Dosya: `src/features/candidates/ai-resume-actions.ts`
- `importResumeFile` sonucunda `added`/`skipped` sayısını ve doldurulan alanları döndür
- `ImportResumeFileResult` tipine `added`, `skipped`, `filledFields` ekle
- `filledFields` = çıkarıldıgı alan isimlerinin listesi (headline, location, skills, vb.)

### Görev 4 — Profil formu UI/UX profesyonelleştir ve temizle
Dosya: `src/features/candidates/candidate-profile-form.tsx`
- Entry kartlarını daha açık ayır (border, gölge, padding, boşluk)
- Input/textarea/select: `overflow-wrap: anywhere`, `max-width`, net font, text overflow yok
- Gereksiz açıklama metinlerini azalt; sadece gerekli yerlerde bırak
- Accordion başlıklarını daha belirgin yap, badge'leri vurgula
- Kaydet/Geri al butonlarını daha görünür yap
- Import durum mesajlarını açıklayıcı yap: "X alan eklendi, Y alan zaten vardı, Z alan boş kaldı (CV'de yok)"
- **Duplicate geri al butonunu tekilleştir:** lines 795-806'deki koşullu geri al butonunu kaldır, sadece lines 1527-1536'deki alt çubuktaki buton kalır
- **Teknik mesajları kaldır/sadeleştir:** `resumeImport.privacy`, `resumeImport.processingStatus`, `resumeImport.fileHint`, `resumeImport.empty` — sunucu/Gemini/Groq/saklama içermemeli
- Boş profil onboarding kartını iyileştir

### Görev 5 — Çeviri dosyalarını temizle
Dosyalar: `src/messages/tr.json` (ve diğer locale dosyaları gerekirse)
- `resumeImport.description` (1177, 1627): sunucu/AI teknik detaylarını kaldır, sadece "CV dosyanızı seçin, bilgiler forma aktarılsın" kalır
- `resumeImport.privacy` (1178, 1644): kaldır veya çok sadeleştir (sunucu/Gemini/Groq içermesin)
- `resumeImport.processingStatus` (1182, 1646): "CV'niz sunucuda işleniyor" → "İşleniyor…"
- `resumeImport.fileHint` (1183, 1639): taranmış PDF sağlayıcı notunu kaldır, sadece dosya türü ve boyut sınırı
- `resumeImport.empty` (1192, 1629): AI sağlayıcı yapılandırma notunu kaldır, sadece "bilgileri elle girin" yöntele

### Görev 6 — Profil form stillerini düzenle
Dosya: `src/styles/global.css`
- `candidate-profile-entry`, `candidate-entry-fields`, `candidate-profile-accordion-card` düzenle
- Text overflow için `overflow-wrap: anywhere`, `max-width` ekle
- Font yüküklüklü yapıyı düzelt (okunabilir sans-serif)
- Responsive davranışları koru (mobile + desktop)

### Görev 7 — Şema senkronizasyonu (gerekirse)
Dosya: `src/features/candidates/schemas.ts`
- Yeni alan eklenirse tüm consumerları aynı seferde güncelle (Zod + TypeScript)
- `candidateProfileUpdateSchema` ve `candidateProfileValues` senkron tutsun

## Doğrulama (implementasyon sonrası çalıştırılmalı)
- `bun run typecheck` — TypeScript hatası yok
- `bun run lint` — ESLint temiz
- `bun run test:unit` — mevcut testler geçerli (cv-parser, resume-parser, candidate-profile-schema, candidate-profile-sections)
- Manuel test: PDF yükle → çıkarıldıgı alanlar forma doğru yazıldı, çıkmayan alanlar boş kaldı, merge ile eski veri silinmedi, revert çalışıyor; UI'da gereksiz teknik mesaj yok, duplicate buton yok

## Açık sorun (implementasyon sırasında)
- PDF dosyası model tarafından doğrudan okunamıyor; içerik doğrulanamaz. CV'nin gerçek yapısını görmek için kullanıcının PDF'den örnek metin paylaşması gerekebilir.
- AI API anahtarlarının runtime'da erişilebilirliği test edilmeli (`.env.local` var).