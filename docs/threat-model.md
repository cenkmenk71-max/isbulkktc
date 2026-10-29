# V4 güvenlik sınırları ve başlangıç tehdit modeli

Bu belge [`architecture-v4.md`](./architecture-v4.md) ile birlikte
değerlendirilir; iskelet kurulumu veya yerel test çalıştırması güvenlik
sertifikası değildir. Kaynak dosyadaki V4 §4, §5 ve §9 daha kapsamlı kaynak
sözleşmesidir.

## Korunan varlıklar

- Auth oturumu, aday iletişim/profil/CV ve başvuru verisi.
- Şirket kullanıcıları, doğrulama kararı ve şirket kapsamlı işlemler.
- Paket tanımları/atamaları ve anlık ilan hakları.
- Moderasyon, admin rolleri ve audit geçmişi.
- Harici e-posta/AI/Bakanlık/Storage kimlik bilgileri.

## Güvenilmeyen girdiler

Her form/action/route girdisi, query/cookie, istemci claim'i/metadata'sı,
dosya baytları ve adı/MIME alanı, dış API cevabı ve AI üretimi. Sahiplik,
üyelik, rol ve paket hakları payload'dan doğrulanmadan kabul edilmez.

## İlk kurulumda uygulanmış kontroller

| Tehdit | Birinci kontrol | İkinci kontrol / test |
|---|---|---|
| Kullanıcının admin yetkisi yükseltmesi | `user_roles` için yalnız `SELECT`, kendine ait satır; `INSERT/UPDATE/DELETE` grant'i yok | `authenticated` rolüyle negatif pgTAP |
| Başka kullanıcının profili | Tablo RLS'i, Auth `uid()` ile satır kapsamı; DAL yalnız güvenli DTO döndürür | İki farklı Auth kimliğiyle pozitif/negatif pgTAP |
| Şirket ID'si ile IDOR | Şirket kaydı yalnız verified/aktif üye/özel admin kapsamıyla okunur | Başka şirket için sıfır sonuç veren RLS testi |
| Başka şirket adına owner/member ekleme | Doğrudan SQL grant yok; owner ilk kez yalnız `create_company` transaction'ında kurulur | Hem tablo yazımı hem rol yükseltme testi |
| Sahte şirket doğrulaması | Client `INSERT/UPDATE` grant'i yok; RPC yalnız pending şirket oluşturur | Doğrudan insert testte reddedilir |
| Sahte profil rolü/durum değişikliği | Yalnız display_name/locale sütunlarına update grant'i | Rol/durum yazımı veritabanında izinli değil |
| OAuth sağlayıcı metadata'sıyla profil adı manipülasyonu | Auth trigger yalnızca doğrulanmış metadata alan adlarını seçer, kontrol karakterlerini temizler ve 80 karakterle sınırlar | Yeni kullanıcı metadata'sı için pozitif ve sınır testi pgTAP |
| İstemcide secret/service-role sızıntısı | Yalnız public Supabase publishable anahtarı örneklenir | Dağıtım öncesi secret tarama kabul kapısı |
| Kişisel dosya/izinsiz yükleme | Özel CV kovasında upload/download RLS politikası **yok** (varsayılan deny) | Negatif Storage testi; akış onaylanmadan açılmaz |
| Audit kaydı tahrifi | Uygulama rollerinde audit tablosu için hiçbir grant/policy yok | Üretim alarmı ve privileged DB operatör prosedürü henüz gerekli |
| Taslak ilanı doğrudan yayımlama veya paket hakkını aşma | İstemci yayın durumu/sürelerini yazamaz; atomik RPC onay, doğrulanmış şirket, etkin paket snapshot'ı ve aktif ilan sınırını kontrol eder | Yetkisiz doğrudan yazım, paketsiz yayın ve paket limit aşımı pgTAP |
| Paket hakkı yükseltme/şirketler arası paket atama | Paket CRUD/ataması yalnız etkin platform yöneticisinin kısıtlı RPC'siyle; şirketler atama tablosunu doğrudan okuyamaz/yazamaz | Yönetici dışı ret, başka şirket hakkını okuma reddi, paket snapshot ve limit testleri |
| MFA olmadan admin işlemi | `has_platform_role` yalnız aktif hesap ve imzalı JWT `aal2` claim'iyle true döner; paket RPC'leri ve yönetici RLS yolları aynı helper'ı kullanır | AAL1 admin reddi ve AAL2 pozitif/negatif pgTAP; canlı TOTP provası ayrıca gerekir |
| Sahte/başka şirkete ilan girişi | Insert/update RLS'i aktif owner/recruiter üyeliğine ve kendi şirketine bağlıdır | İki şirket kimliğiyle pozitif/negatif pgTAP |
| İlan inceleme yetkisi yükseltme | Submit/review fonksiyonları active session, verification ve platform role'ü transaction içinde tekrar denetler; hassas alanları audit eder | Normal üye ret, admin onay, public queue izolasyonu pgTAP |
| Herkese açık ilan verisi sızıntısı | Anonim istemciler `jobs` tablosunu doğrudan okuyamaz; yalnız seçilmiş alanları döndüren arama ve slug RPC'leri aktif ilanı, tarihi ve doğrulanmış şirketi tekrar filtreler | Anonim arama/detay pozitif testleri; taslak, doğrulanmamış, süresi geçmiş ve bozuk slug negatif pgTAP |
| Kaynak ilanında sahte İşBul doğrulaması veya bozuk provenans | Kaynak ilanı ayrı `job_source_imports` kaydı ve etkin kaynak tarih aralığı olmadan RPC'lerden dönmez; kaynak işverenleri `pending` kalır ve kaynak adı gösterilir | Aktif kaynak ilanı pozitif; süresi geçmiş/provenansı olmayan ilan, tablo doğrudan okuma ve kaynak ilana başvuru negatif pgTAP |
| Kaynak işveren metadata'sı üzerinden platform şirketi sızıntısı veya zararlı harici görsel/link | İlan ve kaynak işveren kamu RPC'leri tanıtımı, faaliyet alanını, konumu, web sitesini, profili ve logoyu yalnız provenansı geçerli kaynak kayıtları için döner; platform ilan DTO'su metadata'yı gizler; profil ve logo URL'leri kaynak host/path kısıtlarıyla sınırlandırılır; doğrudan şirket tablosu okumaları mevcut verified-company RLS/grant kurallarına tabidir | Aktif kaynak işveren metadata'sı pozitif; platform ilanı redaksiyonu ve geçersiz logo/profil hostları için negatif pgTAP; DAL URL allowlist birim testleri |
| Başvuru IDOR veya çift başvuru | Tek aday-ilan unique constraint, açık ve süresi geçmemiş ilan kontrolü, aday/şirket ilişkisine göre RLS ve atomik geçiş fonksiyonu | Adaylar arası ve şirketler arası negatif testler; yinelenen başvurunun reddi |
| Başvuru e-postası sızıntısı veya yetkisiz gönderim | Outbox tablosunda istemci grant'i yok; claim/finish RPC'leri yalnız `service_role` içindir; worker özel `NOTIFICATION_WORKER_TOKEN` bearer değerini, **yapılandırma kontrolünden önce** zorunlu kılar (eksik bir sır guard'ı devre dışı bırakamaz); doğrulanmamış e-posta adresleri claim edilmez | Service-role claim ve alıcı erişimi pgTAP; kimliksiz/yanlış-bearer isteğin `401` döndüğü canlı kontrol; cron/Resend secrets Vault'ta tutulur, canlı worker ve teslimat ayrıca doğrulanır |

## Aday profili ve işveren profil incelemesi

- CV ayrıştırma yalnız tarayıcıda yapılır. Ham dosya Server Action'a
  gönderilmez veya saklanmaz; PDF/DOCX ve metin boyutu/sayfa sınırları
  istemcide uygulanır. Yalnız şema ile doğrulanmış, birleştirilmiş profil
  alanları authenticated Server Action'a gönderilir ve adayın kendi özel
  profilinde saklanır. Taranmış PDF/OCR ve harici AI desteklenmez.
- İstemciden gelen profil bölümleri güvenilmeyen JSON kabul edilir; Server
  Action Zod şemasıyla doğrular, veritabanı JSONB kısıtları da nesne alanlarını,
  dizi uzunluğunu ve metin boyutunu sınırlar. Aday satır sahipliği RLS ile
  korunur; `visibility` istemci tarafından değiştirilemez.
- Şirket profili başvurusu yalnız şirket sahibine/üyeliğine göre DAL ve RLS
  üzerinden yazılır. Bekleyen bilgiler public dizine yansıtılmaz. Onay
  platform-admin yetkili RPC'sinden geçer; onay yayınlama kararıdır, resmi
  şirket doğrulaması değildir. Dizindeki hedef şube başvuru ve inceleme
  sırasında katalogla doğrulanır.
- Şirket belgesi seçimi yalnız tarayıcı içi PDF/DOCX metin çıkarımı yapar; kaynak
  dosya sunucuya gönderilmez veya saklanmaz. Yalnız açıkça etiketlenmiş alanlar
  boş profil alanlarına önerilir; dosya/ham metin değil, şirket üyesinin
  onaylayarak mevcut profil başvurusundan ayrıca gönderdiği alanlar kaydedilir.
  Bu belge doğrulaması değildir. Sunucuya yükleme/indirme yolu; tarama, erişim
  denetimi ve saklama/silme politikaları karara bağlanana kadar kapalıdır.

Bu kontroller, uygulamanın tüm güvenlik gereksinimlerinin veya üretim
ortamındaki RLS davranışının doğrulandığı anlamına gelmez. Migration'ların
pozitif ve negatif pgTAP testleri yerel Supabase ortamında çalıştırılmalıdır;
test altyapısı yoksa sonuç geçilmiş sayılmaz.

## Başlangıç yetki tablosu

| Tablo | anon | authenticated | Güvenilir yol |
|---|---|---|---|
| `profiles` | Erişim/grant yok | Yalnız kendi satırını okur; yalnız ad/yerel dilini günceller | Auth insert trigger; account-status operasyon prosedürü |
| `user_roles` | Erişim yok | Yalnız kendi rollerini okuyabilir; yazamaz | İlk admin tek seferlik, e-posta doğrulanmış hesapla Dashboard SQL bootstrap; sonraki admin'ler için ayrı onaylı operasyon |
| `candidate_profiles` | Erişim yok | Yalnız kendi profilini ekler/okur/değiştirir | Authenticated + RLS |
| `companies` | Yalnız verified kayıtları okur | Verified veya üye olduğu şirketi okur | Güvenli `create_company` RPC ile yalnız pending oluşturma |
| `company_members` | Erişim yok | Kendi üyeliği; şirket owner'ı şirket üyelerini okur | `create_company` ilk owner'ı ekler; davet akışı kurulmadı |
| `jobs` | Doğrudan tablo grant'i yok; aktif/yayındaki ilanların seçilmiş alanları ve verified şirket bilgisi yalnız `search_public_jobs` / `get_public_job_details` RPC'leriyle döner | Public ilanlar; aktif owner/recruiter kendi şirket ilanlarını, platform admin inceleme kuyruğunu okur. İçerik alanları dışında güvenilir durum değişikliği yoktur | Üye taslak yazımı; verified company submission; admin review; paket haklarını denetleyen `publish_approved_job` |
| `job_packages` | Yalnız etkin paket katalog alanlarını okur | Etkin paket katalog alanlarını okur | Paket yönetim RPC'leri aktif platform admin + AAL2 ve audit ister |
| `company_job_package_assignments` | Erişim/grant yok | Erişim/grant yok; etkin haklar yetki kontrollü RPC DTO'sundan okunur | `admin_assign_company_job_package`; doğrulanmış şirket, paket snapshot ve platform admin kontrolü |
| `applications` | Erişim/grant yok | Aday yalnız kendi; aktif owner/recruiter yalnız kendi şirketindeki ilan başvurularını okur. Yazma ve geçiş yalnız güvenli RPC | `apply_to_job` ve `transition_application`; aday/şirket sahipliği, açık ilan ve durum geçişi doğrulanır |
| `audit_logs` | Erişim yok | Erişim/grant yok | Dar, audit yazan SECURITY DEFINER RPC'leri |
| Storage nesneleri | CV erişimi yok | CV upload/download erişimi yok | Dosya taraması/yetki yaşam döngüsü henüz kurulmadı |

TOTP enrollment/challenge, authenticated server actions üzerinden Supabase Auth
MFA API'sini kullanır. Faktör sahibi Auth tarafından doğrulanır; başarı sonrası
session cookie'leri yenilenir. Admin ekranı hem atanmış platform rolü hem de
aal2 ister. MFA yalnız UI kontrolü değildir: imzalı `aal2` claim'i doğrudan DB
RPC/RLS yolunda da zorunludur. Gerçek Production Auth sağlayıcısı ve canlı
TOTP doğrulaması henüz test edilmemiştir.

Bu matris yalnız ilk migration'ın tablolarına ilişkindir. Sonraki modüller
eklenecek her tabloyu, sütun grant'lerini, tüm dört CRUD politikasını ve
anon/auth şirket-aday çapraz testlerini aynı migration kapsamına dahil eder.

## Üretim öncesi istismara dayanıklılık kapıları

- MFA ve en az ayrıcalıkla admin bootstrap; kimsenin kendi admin rolünü
  atayamaması; paket/rol/doğrulama kararlarının audit ve actor kaydı.
- Paket kataloğu boşken yayınlama başarısız olmalı; paralel yayınlamada şirket
  satır kilidi paket başına aktif ilan sınırının aşılmasını önlemeli.
- RLS/grant tablosunun her yeni migration için otomatik negatif pgTAP'i.
- CV file signature + MIME + uzantı + byte sınırı, karantina/tarama,
  anonim URL sızıntısı, yetkisiz kullanıcı indirme ve silme testi.
- CSRF, rate limit, IDOR, oturum yenileme, brute-force ve MFA testleri.
- Secret/PII-safe yapılandırılmış log, olay alarmları ve yıllık değil
  yayın öncesi somut backup/restore provası.
- WebGPU/render başarısızlığında form verisini ve ana ürün işlevlerini
  koruyan 3D'siz UX; PII veya server-modülünün `experience/` içine taşmaması.

## Açık riskler

Tek kişi operasyonunda ikinci admin onayı garanti edilemez; gerçek MFA sağlayıcı,
admin bootstrap prosedürü, şirket doğrulama kriteri, upload izinleri, password
policy, rate-limit sağlayıcısı, backup planı ve olay alarm endpoint'i
yapılandırılmamıştır. Bunlar bilinçli planlama blokajlarıdır; implemented
kontroller gibi varsayılmamalıdır.
