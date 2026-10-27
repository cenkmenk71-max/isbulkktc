# V4 veri sınıflandırması, erişimi ve saklama yaşam döngüsü

V4 bir retention süresi, işletme hesabı, ülke/region, hukuki dayanak veya
backup planı belirlemez. Sınır ötesi gizlilik yükümlülükleri hukuk uzmanıyla
onaylanmadan hassas veri işleme açılmaz. Aşağıdaki tablo karar eksiklerini ve
ilk kurulumun erişim durumunu açıkça kaydeder; uydurma silme süresi içermez.

| Veri | Sınıf / asıl erişim | İlk kurulum | Saklama / imha kararı |
|---|---|---|---|
| Supabase kimlik bilgileri ve Auth metadata | Kimlik; Auth sunucusu + oturum sahibinin yetkisi | Yeni hesabın display name'i güvenilmeyen metadata olarak 80 karaktere kırpılarak profil tetikleyicisine geçer | Hesap kapatma, auth silme ve varsa yasal hold süreci ürün/hukuk kararı bekliyor |
| Profil ve aday bilgisi | Kişisel veri; profil sahibi | RLS yalnız sahibin erişimine izin verir; başlık, konum, beceriler ve sınırlı JSONB deneyim/eğitim/dil/sertifika bölümleri doğrulanır | Dışa aktarma/silme, saklama zamanı ve başvuru istisnası bekliyor |
| Şirket ve üyelik | İş verisi; şirket üyeleri ve onaylanan kamuya açık alanlar | Şirket hesabı; özel profil başvurusu; onaylanan alanlar mevcut rehbere yansır. Yönetici incelemesi şirketin resmi doğrulama durumunu değiştirmez | Reddedilen/terk edilmiş başvuruların saklama ve şirket sahibi kaybı prosedürü bekliyor |
| CV, başvuru eki | Özgeçmiş içeriği hassas kişisel veri; profil sahibi | PDF/DOCX metni tarayıcıda işlenir. Ham dosya yüklenmez/saklanmaz; çıkarılan alanlar mevcut değerleri koruyan düzenlenebilir bir form taslağına eklenir. Aday alanları gözden geçirip kaydetme eylemini başlatmadıkça profil veritabanı değişmez; onaylanan alanlar doğrulamalı Server Action ile özel profile kaydedilir. OCR ve harici AI yoktur. CV/başvuru eki dosya akışı kapalıdır | Ayrı dosya upload/depolama akışı kurulmadı; gelecekte açılması için dosya tipi/limit, scanner/karantina, erişim audit'i ve silme yaşam döngüsü kararı gerekir |
| Şirket profil başvurusu | Şirket iletişim ve faaliyet bilgileri; başvuru şirketi ve inceleme yetkili admin | Bekleyen taslak RLS ile şirket kapsamındadır; onaylanan rehber alanları kamuya açıktır. Metin tabanlı sicil/işletme belgesi yalnız tarayıcıda okunup açıkça etiketlenmiş alanları düzenlenebilir forma önerir; kaynak dosya ve ham çıkarım metni sunucuya gönderilmez. Şirket sahibi formu inceleyip değişiklikleri incelemeye gönderene kadar öneriler veritabanına kaydedilmez. Resmi belge doğrulaması ve sunucuya dosya yükleme kapalıdır | Bekleyen/reddedilen başvurular ve yayımlanan iletişim verileri için saklama, düzeltme ve silme süresi kararı bekliyor |
| Ödeme dekontu ve banka bildirimi | Çok hassas finans verisi; yalnız ilgili şirket ve yetkili billing admin | Private bucket var, dekont yükleme ve ödeme işleme kapalı | Banka/muhasebe ve yasal saklama süresi kararı bekliyor |
| Admin/audit kararı | Operasyonel, kötüye kullanımda yüksek risk | İstemci grant'i yok; SECURITY DEFINER RPC'si yalnız redakte edilmiş yeni audit kaydı yazıyor | Immutable log arşiv ve erişim/retention kuralı bekliyor |
| Güvenlik/HTTP/hata logu | Metadatayla sınırlı | Action hataları sadece güvenli alan olan sağlayıcı error code'u loglar | Log sağlayıcı, kişisel veri scrubber, retention/erişim/region bekliyor |
| AI/CV çıkarımı, çeviri, sohbet | Çok hassas aday iletişimi | CV metni için harici AI etkin değil; ayrıştırma yerel tarayıcıda yapılır. Ürün çevirileri statik kataloglardadır; harici çeviri API'si yoktur | AI/çeviri sağlayıcısı, model eğitimi, DPA/region ve prompt saklama kararı bekliyor |
| Yedek/geri yükleme | Bütün tablo ve private nesneler | Otomatik yedek/PITR/restore kurulumu veya kanıtı yok | RPO/RTO, yedek şifreleme, erişim, silinen kişinin yedekten çıkma süreci bekliyor |

## Zorunlu lifecycle kapıları

1. Veriyi hangi ürün işlevinin gerektirdiğini, kimin görüntülediğini ve
   kullanıcının ne zaman dışa aktarabildiğini tanımla.
2. Her kişisel kaydın sahibi/organizasyonunu, soft delete mi gerçek erase mi
   olduğunu, açık yasal hold ve audit geçmişine etkisini tanımla.
3. Şirket belge/CV upload'ı açılmadan MIME/uzantı/imza ve byte sınırı,
   karantina, tarama, private erişim, URL expiration, orphan cleanup,
   request-rate/quota ve backup retention testlerini yap.
4. Hesap kapatma/erasure akışını önce test kopyasında yürüt; cascade'in
   başvuruyu, audit delilini veya şirket owner'ını yanlışlıkla silmediğini
   doğrula.
5. Supabase yedek ayarlarını plan/region ile kanıtla; recovery runbook'taki
   restore provasını tamamla. Canlı üretimde hiçbir cleanup işlemini prova
   yapılmadan çalıştırma.
6. Saklama süresi kararlaştırılana kadar hassas payload'ı metadata/loglara
   kopyalama ve AI/dış API'ye aktarma.

V4'ün RPO ≤ 24 saat / RTO ≤ 8 saat değerleri hosting kabiliyeti kanıtlanıp
ürün sahibi onayladıktan sonra hedef kabul edilebilir; mevcut kurulumda
garanti veya yedekleme doğrulaması değildir.
