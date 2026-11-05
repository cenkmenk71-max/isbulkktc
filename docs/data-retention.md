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
| Başvuru kaydı ve aday iletişim paylaşımı | Aday-yazımı metin ve aday e-postası; başvuru sahibi aday ile ilanın şirketi | `applications.cover_letter` adayın kendi metnidir. Aday iletişimi (`application_contact_shares.email`) yalnız aday paylaşımı onayladığında kopyalanır; `application_events` yalnız durum geçişini tutar, PII taşımaz. Üç tabloda da istemci grant'i yok; erişim yalnız SECURITY DEFINER RPC'leriyle | Başvuru ve iletişim paylaşımı için saklama/silme süresi ve şirketin başvuru verisini ne kadar tutacağı ürün/hukuk kararı bekliyor |
| Şirket profil başvurusu | Şirket iletişim ve faaliyet bilgileri; başvuru şirketi ve inceleme yetkili admin | Bekleyen taslak RLS ile şirket kapsamındadır; onaylanan rehber alanları kamuya açıktır. Metin tabanlı sicil/işletme belgesi yalnız tarayıcıda okunup açıkça etiketlenmiş alanları düzenlenebilir forma önerir; kaynak dosya ve ham çıkarım metni sunucuya gönderilmez. Şirket sahibi formu inceleyip değişiklikleri incelemeye gönderene kadar öneriler veritabanına kaydedilmez. Resmi belge doğrulaması ve sunucuya dosya yükleme kapalıdır | Bekleyen/reddedilen başvurular ve yayımlanan iletişim verileri için saklama, düzeltme ve silme süresi kararı bekliyor |
| Yönetilen içerik ve kamuya açık işletme rehberi | Kamuya açık yayın içeriği; `site_content`/`faq_entries`/`listing_plans` yalnız platform admin, rehber herkese açık | Tablolarda istemci grant'i yok; okuma `get_public_*`, yazma `admin_*` SECURITY DEFINER RPC'leriyle. `directory_locations` işletmenin kendi kamuya açık iletişimini tutar (adres, telefon, e-posta, web sitesi) ve `get_public_directory()` ile sunulur. `site_content.updated_by` admin uuid'sidir (`on delete set null`) | Yayından kaldırılan içerik/rehber kayıtlarının silinmesi ve eski sürüm saklama süresi ürün kararı bekliyor |
| Ödeme dekontu ve banka bildirimi | Çok hassas finans verisi; yalnız ilgili şirket ve yetkili billing admin | Private bucket var, dekont yükleme ve ödeme işleme kapalı | Banka/muhasebe ve yasal saklama süresi kararı bekliyor |
| Admin/audit kararı | Operasyonel, kötüye kullanımda yüksek risk | İstemci grant'i yok; SECURITY DEFINER RPC'si yalnız redakte edilmiş yeni audit kaydı yazıyor | Immutable log arşiv ve erişim/retention kuralı bekliyor |
| Başvuru bildirimi ve e-posta kuyruğu | Aday/şirket başvuru olayına bağlı işlem verisi; `notifications` sahibine `select`/`read_at` güncellemesi, `notification_email_outbox` yalnız servis rolüne açık | Bildirim kaydı `user_id` ve `application_event_id` taşır; alıcı e-postası kuyrukta **saklanmaz**, gönderim anında `auth.users`'tan çözülür. Yalnız `service_role` işleyebilir; istemci grant'i yok | Bildirimler kullanıcıya `on delete cascade` ile bağlıdır, ancak gönderilmiş/başarısız kuyruk satırları için yaş veya temizleme işi yok; imha süresi ürün kararı bekliyor |
| Çerez/onay tercihi | Kişisel veri değil; tarayıcıda kalır, ancak çerez her istekle sunucuya gönderilir | Ziyaretçi seçimi `localStorage` (`isbulkkktc-cookie-consent-v3`) ve `ib_consent` çerezinde tutulur; ikisi de yalnız iki boole taşır, kimlik veya parmak izi içermez. Çerez `HttpOnly` değildir çünkü banner geri çekmede onu silmelidir; değer gizli bilgi değildir ve `Path=/` olduğu için sunucu tarafında da okunabilir. Onay verilmeden analitik/marketing betiği yüklenmez. `localStorage` silinse bile karar `ib_consent` çerezinden geri okunur | Saklama 180 günle sınırlı: bu süreden eski karar `parseConsent` tarafından yok sayılır ve ziyaretçiye yeniden sorulur. Çerez `Max-Age` ve localStorage yaşı aynı pencereyi paylaşır |
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

## LANE-GÜVENLİK — retention'a dokunan denetim notları

Saldırgan denetimin veri yaşam döngüsüne bakan bulguları (ayrıntı ve kanıt:
[`threat-model.md`](./threat-model.md), "LANE-GÜVENLİK" bölümü):

- **`feedback_submissions` ve `sales_leads` için yaş/temizleme yok; yazma sınırı
  artık DB'de ama IP boyutu app yolunda kollapsıyor.** İki tablo da kimlik
  doğrulaması olmayan çağıranlardan (`anon`) serbest metin kabul ediyor. LANE-SUPABASE
  `20261106000000_v4_anon_write_throttle.sql` ile throttle'ı RPC gövdesine taşıdı,
  yani doğrudan PostgREST çağıran da artık sınırlı (ledger yalnız sha256 taşır,
  ham adres saklanmaz). Kalan açık: migration IP'yi `request.headers`'tan okuyor
  ama Next.js action supabase-js ile çağırdığından ziyaretçi IP'sini göndermiyor,
  bu yüzden app üzerinden gelen tüm gönderimler tek kovaya düşer (site geneli
  pencerede 5 gönderim). Saklama/silme süresi ve gönderen-IP kaydı politikası hâlâ
  ürün kararı bekliyor; ayrıntı ve kanıt: `threat-model.md`, "Açık bulgular" 1.
- **Başarısız/gönderilmiş e-posta kuyruğu satırları.** `notification_email_outbox`
  satırlarında alıcı adresi **saklanmıyor** (gönderim anında `auth.users`'tan
  çözülüyor) — bu retention açısından doğru; ancak satırların yaşı ve temizliği
  için iş yok, karar bekliyor (mevcut tablo notu geçerli).
- **`server-only` sınırı** kişisel veri saklamıyor; retention tablosunu
  değiştirmez, yalnız erişim/ifşa riskini artırır. Açık yönlendirme bulgusu
  kapatıldı (bkz. `threat-model.md`, "Kapatılan bulgular").
