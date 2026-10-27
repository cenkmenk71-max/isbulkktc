# ISBULKKTC — güncel mimari belleği

> **Yetkili sürüm: V4.** Bu belge ve `architecture-v4.md` projenin tek güncel
> mimarisidir. Eski V1 mimari belgesi projeden kaldırılmıştır; V1'e ilişkin
> teknik kararlar geçerli kabul edilmemelidir.

## V4'ün kaynakları ve durumu

- [V4 mimari şartnamesi](./architecture-v4.md), kullanıcının verdiği
  13 Ekim 2026 tarihli V4 dosyasının değiştirilmemiş, SHA-256 ile doğrulanmış
  kopyasıdır. Ürün kapsamı, veri modeli, güvenlik sözleşmeleri, üretim kapıları
  ve solo geliştirici yol haritasının asıl kaynağıdır.
- Kaynağın parmak izi:
  `E44D75C5C30D9ED79F4422DB76E71300D08467CC05EA43086A072A1636754131`.
- Şartname bir **hedef mimari** tanımlar; üretimde çalışır, güvenlik incelemesi
  yapılmış veya canlı servisleri yapılandırılmış bir sistemin kanıtı değildir.
  Mimaride yazılı kabul kapıları ilgili migration, test ve operasyon
  kanıtlarıyla ayrıca geçilmelidir.
- **Mimari hüküm:** PostgreSQL'in nihai veri otoritesi olduğu, Next.js üzerinde
  güvenli DAL içeren modüler monolit. Başlangıçta mikroservis, Kubernetes,
  ayrı arama servisi ve otomatik banka bağlantısı yoktur.

## Çalışan temel ve güven sınırları

- App Router ve TypeScript UI kabuğu `src/app/`; sunucu doğrulaması ve DTO
  sınırları `src/server/`; iş alanları açık servis sınırlarıyla `src/features/`;
  bağımsız grafik deneyimi `src/experience/` altındadır.
- Ekrandaki görünürlük bir erişim denetimi değildir. Kimlik doğrulaması
  Supabase Auth ile; güvenli sorgu, kaynak düzeyinde yetki kontrolü ve DTO
  üretimi Next.js sunucu DAL'i ile; satır sahipliği PostgreSQL RLS, SQL
  izinleri, kısıtlar ve transaction'larla uygulanır.
- Aday ve şirket kullanıcıları için birbirini dışlayan genel bir `employer`
  rolü yoktur. `platform_admin` kullanıcı tarafından yazılamayan platform
  rolüdür; şirket yetkisi ise sadece ilgili şirket için
  aktif `company_members` kaydı ve açık izinle verilir.
- `service_role` veya başka ayrıcalıklı bir secret normal kullanıcı erişimi
  için kullanılmaz; tarayıcıya sır gönderilmez. Server Action ve Route Handler
  her çağrıda girdiyi doğrular, oturumu doğrular ve gerekli şirket/kaynak
  yetkisini DAL'de tekrar denetler.
- Bakanlık API erişimi, OAuth/AI sağlayıcısı ve veri saklama süreleri
  belirtilmemiştir. Bu değerler uydurulmaz; kişisel veri paylaşımı veya dış
  entegrasyon onay verilinceye ve test edilinceye kadar etkinleştirilmez.
- Ürün kapsamı kararı: web sitesinde checkout, kart/çevrimiçi tahsilat, ödeme
  formu veya IBAN bilgisi yayımlanmaz. Paket koşulları ekip ile ayrıca görüşülür;
  IBAN ve ödeme talimatları e-posta/WhatsApp gibi özel kanallardan manuel
  iletilir ve ödeme banka havalesiyle site dışında yapılır. Banka bilgileri,
  iletişim adresleri, tahsilat veya mutabakat otomasyonu uydurulmaz ya da
  siteye eklenmez. Herkese açık paket bilgilendirmesi, fiyat önerileri ve
  etkileşimli otomat seçimi yalnızca tanıtım/iletişim amacı taşır. Gerçek ilan
  hakları yönetici tarafından şirketlere atanır ve paket kaydı ile atama anındaki
  snapshot üzerinden veritabanında denetlenir.

## Alan modelleri ve sürümleme

Uygulamadaki kapsam: identity ve aday profilleri; şirketler ve şirket kapsamlı
üyelik; ilan ve başvuru; yönetici tarafından atanan ilan paketleri ve
denetlenebilir yönetici kararları; aday/işveren başvuru takibi ve site içi
bildirimleri; CV saklama ve sohbet (uygulanmamış); PostgreSQL full-text arama;
doğrulanırsa Bakanlık entegrasyonu; ve iş kuralı taşımayan isteğe bağlı 3D
deneyimi. Başvuru e-postaları için Supabase Edge Function outbox worker kodu
vardır; üretim sırrı ve zamanlanmış çağrı kurulmadan e-posta gönderimi etkin
değildir. Web checkout'u, platform içi
ödeme işleme ve kredi defteri kapsam dışıdır; IBAN ile manuel site dışı havale
ürün kararıdır.

İlk migration, yalnız ilk güvenlik temelini kurar: Auth ile tetiklenen profil,
güvenilir kullanıcı rolleri, aday profil şeması, şirket ve şirket üyeliği,
dar şirket-kur oluşturma RPC'si, redakte edilmiş audit kayıtları ve erişimi
kapalı Storage kovaları. Dosya indirme, yönetici rolü bootstrap'i ve gelecekteki
alan akışları, gerekli izinleri olmayan boş
iskeletlerin “hazır” gösterilmesiyle taklit edilmez. Sonraki her dikey akış
kendi şema/migration'ı, grant'leri, pozitif-negatif RLS testleri, transaction
ve runbook'u ile eklenir.

Şu an çalışan dikey akışlar; kayıt/giriş/çıkış, doğrulanmış kullanıcıya ait
sunucu DAL'i, şirket kurma formu ve atomik güvenli RPC'si ile aday profili
oluşturma/güncellemedir. İlan ve başvuru backend'inde şirket taslakları,
moderasyon, arama ve aday başvuruları bulunur. Onaylanmış ilan, aktif paketi
olan doğrulanmış şirketin yetkili üyesi tarafından yayımlanabilir; eşzamanlı
aktif ilan sınırı ve ilan süresi veritabanında paket snapshot'ıyla atomik
denetlenir. Varsayılan paket eklenmediği için katalog boşken yeni yayınlama
kapalı kalır. Paket ataması sona erse veya paket devre dışı bırakılsa da
yayımlanmış ilanlar kendi ilan süreleri dolana kadar açık kalır; yeni yayınlar
engellenir.
Herkese açık `/packages` sayfası, 1/3/5 ilan ve kurumsal teklif seçeneklerini
paket kapsamı ve etkileşimli otomat deneyimiyle gösterir. TRY tutarları
bilgilendirme amaçlıdır. Sitede ödeme alınmaz ve IBAN yayımlanmaz; paket koşulları
görüşüldükten sonra ödeme talimatları özel kanaldan iletilir, havale site dışında
yapılır. Otomat etkileşimi ödeme veya şirket hakkı ataması yapmaz.
Yönetici tarafından etkinleştirilen hak kataloğu ayrıca listelenir; bu katalog
boşken de bilgilendirme amaçlı paket seçenekleri görünür kalır.
Aday, metin tabanlı PDF veya DOCX dosyasını yalnız
tarayıcıda ayrıştırır; dosyanın kendisi sunucuya yüklenmez veya saklanmaz.
Çıkarılan bilgiler formdaki mevcut değerlerle birleştirilir: tekil başlık ve
konum yalnız boşsa doldurulur, mevcut kayıtlar silinmez, beceri ve bölüm
tekrarları ayıklanır. Bu yalnızca tarayıcıdaki düzenlenebilir form taslağını
değiştirir; aday alanları kontrol edip profil formundaki açık kaydetme eylemini
başlatana kadar hiçbir profil değişikliği kalıcı olmaz. Şema sınırına sığmayan
kayıtların sayısı bildirilir. Taranmış PDF/OCR ve harici AI kullanılmaz.
Google, LinkedIn OIDC ve Facebook OAuth girişleri yalnızca `AUTH_OAUTH_PROVIDERS`
ile açıkça etkinleştirilen ve Supabase Auth'ta ayrıca yapılandırılan sağlayıcılar
için kullanılabilir. Yeni hesap profil adı, Auth metadata'sındaki güvenilmeyen
`display_name`, `full_name` veya `name` alanlarından sınırlandırılarak alınır;
CV, deneyim, beceri, Instagram/Facebook gönderileri veya şirket bilgileri dış
platformlardan içe aktarılmaz. Instagram ve WhatsApp oturum açma sağlayıcısı
olarak sunulmaz. Canlı OAuth, sağlayıcı uygulama kimlik bilgileri ve Supabase
callback/redirect yapılandırması eklenmeden etkin değildir. Kurulum adımları
[`oauth-providers.md`](./oauth-providers.md) dosyasındadır.
E-posta kaydında seçilen destekli arayüz dili, Auth kullanıcı metadata'sından
veritabanı trigger'ında yeniden izin listesine göre doğrulanarak profil tercihine
kaydedilir; desteklenmeyen değerler Türkçe varsayılanına döner.
OAuth kaydında seçilen dil, yalnızca kayıt akışında başlatılan ve callback'te
Auth oluşturulma zamanı ile yeni olduğu doğrulanan kullanıcı profiline yazılır.
Dil intent'i 15 dakikalık HttpOnly/SameSite cookie ile taşınır; mevcut OAuth
hesaplarının profil dili tekrar girişte değiştirilmez.
Şirket sahibi, şirket bilgilerini ve
rehberdeki yönettiği mevcut şubeyi güncelleme başvurusu olarak gönderir.
İşveren, mevcut şirket rehberinde şirket adını arayıp sektör ve KKTC'nin altı
ilçesine göre filtreleyebilir; seçilen şubenin mevcut sektör, iletişim ve
konum bilgileri yalnızca boş form alanlarına öneri olarak kopyalanır. İlçe
seçimi altı sabit seçenekle sınırlıdır; serbest adres veya mahalle girişi ilçe
olarak kaydedilmez. Bu bilgiler düzenlenebilir ve gönderilmeden önce işveren
tarafından gözden geçirilir; rehber eşleşmesi şirket sahipliğini doğrulamaz.
Aday ve şirket formları ile yeni veritabanı yazımları yalnız Lefkoşa, Mağusa,
Girne, İskele, Güzelyurt ve Lefke ilçelerini kabul eder. Eski `Gazimağusa`
değerleri Mağusa'ya dönüştürülür; aynı eski ad kaynak rehber girdilerinde de
Mağusa filtresine eşleşir. Diğer geçersiz tarihsel konumlar veri kaybını
önlemek için otomatik silinmez; değiştirilmeden kalabilir.
İşveren, metin tabanlı şirket sicil/işletme belgesini de tarayıcıda seçerek
belgede açıkça etiketlenmiş şirket adı, kayıtlı adres, ilçe, şirket telefonu,
şirket e-postası ve web sitesi alanlarını yalnızca boş form alanlarına aktarabilir.
Kaynak dosya sunucuya gönderilmez veya saklanmaz; işveren önerileri kontrol edip
mevcut profil başvuru akışından ayrıca gönderir. Bu işlem resmi belge doğrulaması
değildir; taranmış PDF/OCR ve harici AI desteklenmez.
Başvurular onaylanana kadar özel kalır; yalnız yetkili yönetici onayıyla
yayımlanır. Bu yayın, şirketin ayrı resmi doğrulama durumunu değiştirmez.
Şirket belgelerinin sunucuya yüklenip doğrulama kanıtı olarak saklanması,
tarama ve saklama kuralları kararlaştırılmadığı için kapalıdır. E-posta
doğrulama bağlantıları yalnız yapılandırılmış HTTPS uygulama kökenine dönerek
oturuma çevrilir. Askıya alınmış/kapatılmış hesap sunucu DAL'inden reddedilir
ve giriş ekranında yeniden parola girmeye zorlanmadan oturumu kapatma seçeneği
görür.

Ana sayfa ve serbest çalışma tanıtım rotası artık sentetik ilan, şirket,
bölgesel sayı, maaş veya hizmet sağlayıcı verisi göstermez. Ana sayfa yalnız
gerçek kayıt akışlarına bağlanır. Aday paneli, oturum sahibinin kendi
`candidate_profiles` kaydındaki mesleki başlık, konum, en fazla 40 beceriyi ve
doğrulanmış deneyim/eğitim/dil/sertifika bölümlerini sunucu tarafında
doğrulayarak kaydeder; `visibility` daima `private` tutulur. CV içe aktarma,
tam CV oluşturucu veya CV dosyası saklama değildir; halka açık aday profili
yoktur. İlan arama ve başvuru akışı kullanıcıya dönük ilan ve dashboard
sayfalarına bağlıdır. İşveren alanı, temel profil bilgilerinden
hesaplanan bir tamlık özeti, düzenlenmiş şirket bilgileri, kayıtlı profil
kartı ve başvuru inceleme durumunu gösterir; şirket doğrulaması ile rehber
yayın onayı ayrı tutulur. Yalnız onaylanan bilgiler mevcut statik şirket
rehberine uygulanır. Şirket belgesini tarayıcıda okuyup boş form alanlarına
öneri aktarma vardır; sunucuya belge yükleme/doğrulama kanıtı saklama ve canlı
ücretli ilan yayımlama etkin değildir. Kullanıcının sağladığı
CSV dosyalarındaki 1.247 satırdan yaklaşık KKTC koordinat kapsamı dışında kalan
312 kayıt ve Yunanca alfabesiyle yazılmış 2 şirket adı çıkarılmış, yinelenen
22 ilan birleştirilerek 911 tekil şirket kaydı oluşturulmuştur. Aynı şirket
adı ile eşleşen telefon veya web alan adı
şirket kayıtlarını gruplar; farklı adresli şubeler ayrı konumlar olarak
korunur. Rehberde şirket araması adın herhangi bir bölümüne göre eşleşir;
sektör filtresi kayıtlı sektörlerden seçilir ve ilçe filtresi yalnızca altı
KKTC ilçesini sunar. Şube sınıflandırması, açık ilçe adı veya bilinen ve tek
bir ilçeye ait yer adı varsa yapılır; belirsiz ya da eksik kaynak konumları
tahmin edilmez ve ilçe filtresinde gösterilmez. İlçe seçildiğinde şirket
kartında yalnız eşleşen şubeler gösterilir. Sonuçlar Türkçe A–Z sıralanır ve
Z–A sıralaması seçilebilir. Girne/Kyrenia ve Lefkoşa/Nicosia gibi yaygın
ilçe adları eş anlamlı tanınır. Rehber ayrı bir statik veri kümesidir. Mevcut 913 şube konumunun 860'ı
güvenilir kurallarla altı ilçeden birine eşleşir; kalan 53 konum ilçe filtresi
seçildiğinde dışarıda kalır ve sayı kullanıcıya bildirilir. Bu eşleştirme
resmî sınır değerlendirmesi veya kaynak adreslerin doğrulanması değildir.
Koordinat kapsamı yaklaşık bir filtrelemedir; resmi sınır değerlendirmesi
değildir. Bu
kayıtlar şirket hesaplarıyla eşleştirilmez, İşBul KKTC tarafından
doğrulanmaz ve kaynak dosyalarda e-posta sütunu bulunmadığından e-posta
göstermez. Rehber, şirket
kaydının/doğrulamasının veya ilan yayımlamanın yerine geçmez. İlan/başvuru
backend'i `20261020190500_v4_jobs_applications.sql`,
`20261020191000_v4_remove_application_internal_notes.sql` ve
`20261020192000_v4_package_entitlements.sql` migration'larıyla kayıtlıdır:
aktif şirket sahibi/işe alım yetkilisi taslak ilan oluşturup düzenleyebilir;
yalnız doğrulanmış şirket taslağı incelemeye gönderebilir; platform yöneticisi
başvuruyu gerekçeli reddedebilir veya onaylayabilir. Onaylanan ilan, aktif
paket ataması bulunan doğrulanmış şirketin owner/recruiter üyesi tarafından
yayımlanabilir. Paket kataloğu varsayılan kayıt içermez; atanan paketin
eşzamanlı aktif ilan sınırı ve ilan süresi snapshot'ı yayınlama RPC'sinde
transaction içinde denetlenir. Paket ataması veya katalog kaydı sona erdiğinde
yeni yayınlar durur; zaten yayımlanmış ilan kendi ilan süresi dolana kadar
görünür kalır. Kamu araması yalnız doğrulanmış şirkete ait yayımlanmış ve süresi
geçmemiş ilanları PostgreSQL tam metin araması ve sınırlı filtre/sayfalama ile
döndürür. Anon rolünün `jobs` tablosundaki okuması açıkça verilen sütun
grant'leri ve yayımlanmış/doğrulanmış şirket koşullu RLS politikasıyla sınırlıdır.
Ana sayfa önizlemesi sabit `search_path` kullanan, yalnızca ilan başlığı,
doğrulanmış şirket adı ve sonuç sayısını döndüren sınırlı RPC üzerinden sunulur.
`/jobs` ilan dizini, arama/ilçe/çalışma türü/çalışma düzeni filtreleri ve
sayfalama kullanır; herkese açık detay sayfası yalnızca yayındaki ilan
açıklamasını, sorumluluklarını, gerekliliklerini ve şirket adını gösterir.
İçe aktarılan ilanlar ve şirket rehberi kayıtları korunur; ilan ve işveren
kartlarında kaynak rozetleri gösterilmez. İlan detayında doğrulama ve başvuru
koşulları ile orijinal ilan bağlantıları korunur.
Yerelleştirilmiş `/[locale]` hata sınırı beklenmeyen alt rota/render hatalarında
güvenli bir yeniden deneme ve ana sayfaya dönüş sunar; sunucu hata ayrıntılarını
kullanıcıya göstermez ve veri erişimi başarısızken boş sonuç varmış gibi davranmaz.
Bu sınır kendi segmentindeki layout hatalarını kapsamaz; üretim öncesi veritabanı
kararlılığı ve veri bağımlı rotaların E2E doğrulaması ayrıca gereklidir.
Aday, başvurunun işveren hesabına iletildiğini, ilk kez görüntülendiğini ve
durum değişikliklerini kendi panelinde görür; işveren başvuruları şirket paneli
ve ayrıntı sayfasından inceler. Adayın e-posta paylaşımına açık onayı yoksa
işverene iletişim e-postası gösterilmez. Başvuru e-postaları için outbox ve
Supabase Edge Function worker kodu vardır; doğrulanmış e-posta adresleri için
çalışır, ancak üretim sırları ve zamanlanmış çağrı ayrıca yapılandırılmadan
etkin değildir. “İletildi” site hesabında kaydedildiğini, “görüntülendi”
işverenin ayrıntıyı açtığını belirtir; e-posta teslimatı veya işverenin harici
iletişimi takip edildiği anlamına gelmez. Website checkout'u,
platform içi ödeme işleme ve kredi defteri yoktur.
IBAN talimatı özel kanaldan iletilir ve havale site dışında yapılır; ödeme
doğrulama/mutabakat akışı uygulamada henüz yoktur.
`20261020194000_v4_admin_mfa_and_package_console.sql` admin rol denetimini
aktif hesap ve imzalı Supabase Auth AAL2 claim'ine bağlar; yönetici paket
konsolu için gizli paket kataloğu ve doğrulanmış şirket atama özetini sağlayan
yetki kontrollü RPC'leri ekler. `/admin/packages` TOTP enrollment/challenge/
verify ile AAL2 almadan yönetim verisini yüklemez; MFA koruması doğrudan
PostgREST/RPC çağrılarında da veritabanınca uygulanır. Paket oluşturma,
güncelleme, katalogdan kaldırma ve süreli/süresiz şirket ataması arayüzü
mevcuttur. İlk admin rolü yalnız e-postası doğrulanmış operator hesabı için
tek seferlik Dashboard SQL bootstrap runbook'uyla verilir. Production
Supabase'e migration uygulanmadı ve canlı TOTP akışı henüz test edilmedi.
Başvurular yalnız açık ilana yapılabilir, aynı aday-ilan çifti bir kez
kaydedilir; aday kendi başvurusunu, yetkili şirket üyesi yalnız kendi
şirketinin ilan başvurularını görebilir. Durum geçişleri transaction içinde
kontrollü RPC'den geçer. Ana sayfadaki herkese açık ilan araması, yalnız yayındaki ve süresi geçmemiş
ilanların başlığını ve doğrulanmış şirket adını gösteren dar bir önizleme
sunar; arama metni, ilçe, çalışma türü ve çalışma düzeniyle filtrelenebilir.
`/jobs` arama ve detay sayfaları, anonim `jobs` tablosu erişimini açmadan yalnız
seçilmiş herkese açık alanları döndüren, güvenli `search_public_jobs` ve
`get_public_job_details` RPC'lerini kullanır. Platform ilanları yayında, süresi
geçmemiş ve doğrulanmış şirketlere ait olmalıdır. Kaynak sitelerden içe aktarılan
ilanlar ayrıca `job_source_imports` provenans kaydı ve kaynak yayın aralığıyla
filtrelenir; kaynak adı kamu RPC yanıtında belirtilir, kaynak şirketleri
`pending` kalır ve doğrulanmış İşBul şirketi gibi gösterilmez. Bu ilanlarda
İşBul başvuru formu sunulmaz; `apply_to_job` veritabanı doğrulanmış şirket şartını
korur. Kaynak seed'i iki belirtilen siteden alınmış 21 ilanın Türkçe
özetlenmiş içeriğini ve kaynak tarihlerini içerir. Bu tek seferlik snapshot
otomatik eşitlenmez; kaynak geçerlilik tarihleri dolduğunda ilanlar kamu
RPC'lerinden kendiliğinden gizlenir ve güncel içerik için kontrollü bir seed
güncellemesi gerekir. Kaynak ilanı bulunan 21 işveren, doğrulanmış şirket
rehberinden ayrı bir bölümde kalır. Kaynak profilinde açıkça bulunan faaliyet
alanı, ilçe, kısa tanıtım, resmî web sitesi, profil bağlantısı ve logo bilgileri
kaynak provenansı geçerli ilan ve işe alım yapan firma RPC'lerinde gösterilir;
platform ilanlarının şirket DTO'suna bu metadata eklenmez. Şirket tablosunun
doğrudan okunması mevcut verified-company RLS/grant kurallarına bağlı kalır.
Profil ve logo URL'leri kaynak host/path
allowlist'leriyle doğrulanır ve logolar yüklenemezse şirket baş harflerine
dönülür. Gizli/erişim gerektiren telefon ve e-posta bilgileri kopyalanmaz.
Kaynak işverenler `pending` kalır, ana doğrulanmış şirket rehberi sayısına
katılmaz ve kaynak ilanlarında İşBul üzerinden başvuru alınmaz. CV
saklama/bağlama henüz sunulmaz; platform ilanlarının başvuru takibi ve site içi
bildirimleri vardır, e-posta worker'ı ise üretim kurulumu bekler. Aday CV ayrıştırması yalnızca
tarayıcıda düzenlenebilir bir taslak üretir; profil kaydı kullanıcının açık
onayıyla yapılır. Ana sayfa, adaylara CV taslağını inceleyip kaydetme ve üyelik
olmadan ilan arama yollarını; işverenlere ise şirket kaydı, doğrulama ve yayın
yetkisi sonrasındaki ilan yönetimi akışını anlatır. İşverenler için aday
havuzunda profil arama/filtreleme henüz uygulanmadığından pazarlama metninde
mevcut özellik gibi sunulmaz.
Website ödeme ve ödeme mutabakat backend'i uygulanmamıştır; kullanıcı
ödemeleri IBAN ile site dışından manuel yapılır. Veritabanı
RLS/grant, durum geçişi ve başvuru e-posta outbox yetkileri yerel Supabase
`test:db` ile doğrulanmıştır (`PASS`, 5 pgTAP dosyası, 171 assertion);
bu sonuç production Supabase kurulumu veya üretim hazırlığı kanıtı değildir.
Rehberi yeni CSV dışa aktarımlarıyla yenilemek için
`npm run import:company-directory -- "C:\path\to\company-csvs"` komutu kullanılır.

Paketlerden bağımsız `/about`, `/blog` ve `/contact` sayfaları TR/EN/RU/EL/FA/DE
dillerinde yayımlanır ve birincil gezinme, mobil menü, alt gezinme ve site
haritasında yer alır. Blog, KKTC istihdamı ve çalışma hayatı sorguları için Google Haberler
RSS başlıklarını sunucu tarafında alır; akış 30 dakikalık yeniden doğrulamayla
yenilenir, tarih ve yayıncıyı gösterir ve her kartı Google Haberler üzerinden
yayıncıya bağlar. Aynı olayla ilgili sendikasyon başlıkları, en güncel haber
korunarak tekilleştirilir. Haber metni kopyalanmaz; kaynak akışı yoksa sayfa bunu
açıkça belirtir ve doğrudan güncel kaynak aramasına bağlantı verir. Bu, İşBul
KKTC'nin özgün haber servisi veya haber doğrulaması değildir. Haber görselleri
Unsplash lisansı kapsamında indirilen, başlığın konusuna göre seçilmiş temsili
fotoğraflardır; haber olayının kaynak fotoğrafı oldukları iddia edilmez.
İletişim sayfası kullanıcı tarafından sağlanan işletme e-postasını, telefon/WhatsApp
bağlantılarını ve Alsancak, KKTC konumunu altı desteklenen dilde gösterir.
E-posta bağlantısı kullanıcının e-posta uygulamasında çevrilebilir konu ve mesaj
taslağı açar; kullanıcı taslağı gözden geçirip kendisi gönderir. Site e-postayı
otomatik göndermez ve iletişim formu içermez.

`next-intl` ile TR/EN/RU/EL/FA/DE yönlendirmesi ve her arayüz mesaj anahtarının
tam çevirileri etkindir. Her dil kendi eksiksiz mesaj kataloğunu kullanır; eksik
bir anahtar İngilizce varsayılanıyla gizlenmez. Farsça sayfalarda RTL yönü
uygulanır. V4'te hedeflenen İbranice ve ana sayfa 3D deneyimi uygulanmamıştır.
Önceki sürüm notunda belirtilen eski 3D jeton/fiyat gösteriminin kaldırılması,
etkileşimli otomatı kaldırmak anlamına gelmez: otomat ve herkesin görebileceği
paket bilgilendirme/fiyat önerileri `/packages` sayfasında mevcuttur. Ödeme site
dışında IBAN havalesiyle yapılır; banka bilgileri sitede yayımlanmaz, özel
kanallardan iletilir. Yönetici tanımlı etkin ilan hakları ayrıca listelenir;
katalog boşsa boş durum gösterilir.
İlk Windows `npm run test:db` denemesi, Windows Docker CLI bulunmadığından
`127.0.0.1:54322` bağlantı reddiyle sonuçlandı. Ubuntu 24.04 WSL2 içinde Docker
Engine 29.8.1 ve Compose 5.5.1 doğrulandı; proje npm DB komutları artık D:
üzerindeki sabit sürümlü WSL Supabase CLI'yı bu motora yönlendirir. Gerçek
yerel doğrulamada `npm run db:status` başarılı oldu ve
`npm run test:db` pgTAP sonucu `PASS` verdi (4 dosya, 127 assertion). Bu sonuç WASM
emülasyonundan ayrı olarak yerel Supabase PostgreSQL üzerinde alındı.
`.github/workflows/ci.yml` de aynı CLI sürümü ve npm DB komutlarıyla Ubuntu
runner'da gerçek Supabase/pgTAP testini zorunlu CI kapısı olarak çalıştırır.

## İlk sürüm için güvenlik değişmezleri

1. `user_roles` ve admin atama yolu istemci yazımına kapalıdır. İlk
   platform-admin kurulumu e-postası doğrulanmış kullanıcıyı ve boş admin
   listesini zorunlu kılan tek-seferlik Dashboard SQL runbook'undan geçer.
   Yönetici UI'si ve tüm platform rolü kontrolleri AAL2 ister; production'da
   ilk kullanıcı/MFA kurulumu ayrıca doğrulanmalıdır.
2. `company_members` üzerindeki owner rolü ancak aynı transaction içindeki
   `create_company` RPC'siyle oluşur. Kullanıcı ID'si, rol, durum ve paket
   hakları istemcinin güvenilir yazma alanları değildir.
3. Auth'tan gelen profil tetikleyicisi sabit, boş `search_path` altında çalışır;
   aynı kullanıcı için idempotent `UPSERT` uygular. Profil satırı yokluğunu
   oturum doğrulaması olarak yorumlamayın.
4. Doğrulanmış şirketler ve herkese açık içerik dışında PII private kalır.
   Aday CV'leri ve yeni public varlık yüklemeleri bucket düzeyinde
   private/default-deny durumundadır; file signature taraması,
   sahiplik denetimi ve kısa süreli imzalı erişim tasarımı gelmeden yükleme ve
   indirme açılmaz.
5. Paket tanımı ve şirkete ataması yalnız platform-admin RPC'siyle yapılır;
   publication anında atama snapshot'ı, şirketin aktif ilan sayısı ve şirket
   satır kilidi aynı transaction'da denetlenir.
6. AI çıktısı yalnız kullanıcı tarafından gözden geçirilmiş öneridir; harici
   AI/bakanlık servisleri kendi izin, hata ve gizlilik doğrulaması olmadan
   çağrılmaz.
7. Temel arama, kayıt ve şirket/ilan akışları 3D olmadan erişilebilir ve
   çalışır; WebGPU opsiyonel enhancement'tır, erişilebilir DOM'un yerine
   geçmez.

## Aşamalar ve release gates

1. **Karar kapısı:** Paket hakları, şirket üyeliği/devir ve dosya saklama/
   erişim kararlarını doğrula. Ödeme site dışında IBAN havalesi ile yürür; web
   checkout'u, banka bilgilerinin sitede yayımlanması ve platform içi tahsilat
   yoktur.
2. **Temel + güvenlik:** Geliştirme/veri tabanı ortamlarını ayır, migration ve
   DAL/RLS/roles tamamla. Anonim/adaya/başka şirket üyesine erişimi reddeden
   DB testleri CI'da geçmeden sürdürme.
3. **İş akışı:** Yetkili şirket oluşturma/doğrulaması, ilana yazma, moderasyon,
   PostgreSQL arama ve başvuru; yetkisiz şirket ID ile negatif test.
4. **Paket hakları:** Yönetici UI, veritabanı AAL2 sınırı ve bir-seferlik
   bootstrap runbook'u uygulanmıştır. Production'a açmadan önce hosted projede
   migration'ları uygula, admin hesabını/MFA'yı kur, onaylı katalog/atama
   verisini gir ve canlı yetki testini tamamla.
5. **Operasyon:** Rate limit, secret/PII-safe log, alarm, yedek ve gerçek
   restore provası; P0 kabul kapıları olmadan üretim açılışı yok.
6. **Deneyim/ölçek:** Ölçülmüş performans, 3D/reduced-motion fallback,
   etkin altı dil/RTL; yedinci dil ve harici AI/sohbet, gizlilik ve maliyet
   kabul kapıları tamamlanınca.

Core Web Vitals hedefleri p75'te LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1'dir;
ölçülmüş sonuç değildir. RPO 24 saat / RTO 8 saat yalnız hosting kabiliyeti
onaylanınca hedef olur. Paket fiyatları, boyut limitleri ve alan retention
politikaları ürün sahibinin kararı olmadan sabitlenmez.

## Yaşayan doküman ve yerel doğrulama

- VS Code/Copilot workspace talimatları, skills, MCP kapsamı ve araç kurulumu:
  [developer-tooling.md](./developer-tooling.md).
- Tehdit modeli: [threat-model.md](./threat-model.md).
- Kişisel veri ve dosya yaşam döngüsü: [data-retention.md](./data-retention.md).
- Operasyon runbook'ları: [`runbooks/`](./runbooks/).
- Hosted Supabase/Vercel/domain canlıya geçiş adımları:
  [`runbooks/production-launch.md`](./runbooks/production-launch.md).
- Ölçüm/sahne kabul hedefi: [performance-budget.md](./performance-budget.md)
  ve [`scenes/`](./scenes/).
- Geri döndürülemeyen kararlar: [`decisions/`](./decisions/) altında ADR.
- Hızlı yerel kontroller: `npm run lint`, `npm run typecheck`,
  `npm run test:unit`, `npm run build`, `npm run test:e2e`.
- Veritabanı ve pgTAP için `npm run db:start` sonrasında `npm run test:db`.
  Docker ve geçerli gerçek Supabase test sonuçları olmadan bu kapı geçmiş
  sayılmaz. Storage ve gerçek Auth/e-posta sağlayıcısı yerel veya test
  kimlik bilgileriyle ayrıca kurulmalıdır.
