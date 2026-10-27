# ISBULKKTC — Üretim Hedef Mimari Spesifikasyonu V4

**Sürüm:** 4.0  
**Tarih:** 13 Ekim 2026  
**Proje durumu:** New  
**Hedef kullanıcılar:** Adaylar ve işverenler  
**Gelir modeli:** Ücretli ilan paketleri  
**İlk ödeme yöntemi:** Manuel IBAN banka transferi ve yönetici mutabakatı  
**Geliştirme modeli:** Tek geliştirici  
**Öncelik:** Dengeli — güvenlik, işlevsellik, performans ve görsel kalite  
**Temel teknoloji hedefi:** Next.js App Router + TypeScript + Supabase/PostgreSQL  
**Belge durumu:** Hedef mimari ve doğrulama sözleşmesi; uygulanmış/denetlenmiş sistem kanıtı değildir.

---

## 0. V4'ün amacı ve karar özeti

V4, kullanıcının sağladığı `architecture_specification (1).md` dosyasındaki ürün hedeflerini ve V3 spesifikasyonunu temel alır. Orijinal gereksinimler sessizce kaldırılmaz. Yeni öneriler, doğrulanması gereken varsayımlar ve üretim öncesi kabul kapıları ayrı gösterilir.

### V3 eleştirisinden V4'e taşınan zorunlu düzeltmeler

1. Yönetici rolü ataması ve yüksek yetkili işlemler için açık güven sınırı.
2. Her tablo/işlem için yetki matrisi; RLS + veritabanı izinleri + sunucu tarafı yetkilendirme.
3. IBAN sipariş durum makinesi ve tek transaction içinde tek seferlik hak tahsisi.
4. Banka referansı tekrarını ve aynı siparişe iki kez ödeme/kredi kaydını engelleyen benzersizlik kuralları.
5. Kredi bakiyesinin yanında denetlenebilir, eklemeli (append-only) hareket defteri.
6. Şirket üyeliği kapsamlı izinler; global `employer` rolü tek başına şirket verisine erişim sağlamaz.
7. CV/dekont için özel depolama, dosya doğrulama, karantina/tarama seçeneği, erişim ve silme yaşam döngüsü.
8. Paket snapshot'ı, moderasyon ve kredi tüketimi arasındaki atomik kurallar.
9. RPO/RTO, yedek geri yükleme provası, olay müdahalesi ve gözlemlenebilirlik.
10. Ölçülebilir performans bütçeleri, mobil testler ve 3D kapalıyken de tam işlevsellik.
11. Her tablo için pozitif ve negatif RLS testleri; üretim kapıları gerçek test sonuçları olmadan geçilmiş sayılmaz.
12. Ürün kapsamı dikey akışlarla aşamalandırılır; 3D/AI/dış API, temel işe alım ve ödeme güvenliğinin önüne geçmez.

### Mimari hüküm

**Modüler monolit** tercih edilir. Başlangıçta mikroservis, Kubernetes, ayrı arama kümesi veya otomatik banka entegrasyonu varsayılmaz. Next.js uygulaması modüllere ayrılır; PostgreSQL veri bütünlüğü ve yetkilendirme için merkezi otoritedir. Three.js yalnızca görsel deneyim katmanıdır; iş kurallarına sahip olmaz.

---

## 1. Kaynak gereksinimleri ve kapsam izlenebilirliği

Aşağıdaki özellikler orijinal spesifikasyondan gelir. Uygulama sırası V4'te yeniden düzenlenmiştir; bu, gereksinimin iptal edildiği anlamına gelmez.

| Orijinal gereksinim | V4 kararı | Yayın aşaması / not |
|---|---|---|
| Next.js App Router, TypeScript | Korunur | Temel |
| Turbopack tabanlı geliştirme akışı | Korunur; gerçek build uyumluluğu doğrulanır | Temel |
| Tailwind CSS v4 ve tekrar kullanılabilir UI | Korunur | Temel |
| Three.js `Experience` katmanı | Korunur, DOM iş mantığından ayrılır | Görsel deneyim |
| WebGPU/WebGPURenderer ve TSL shader'ları | İsteğe bağlı iyileştirme; destek ve fallback şart | Deneysel |
| GSAP / ScrollTrigger | Korunur; reduced-motion ve hata fallback'i gerekir | Görsel deneyim |
| KKTC'nin altı bölgesi için 3D tarihî düğümler | Korunur; bölge adları/içerikleri ürün sahibi tarafından doğrulanır | Görsel deneyim |
| DOM ↔ 3D bridge/store | Yalnızca görsel durum ve navigasyon olayı taşır | Görsel deneyim |
| Aday ve işveren kaydı/girişi | Korunur; ilk sürümde e-posta tabanlı temel akış önerilir | Temel |
| Google/LinkedIn/Facebook/telefon girişi | Kapsam korunur; sağlayıcı ve maliyet doğrulanana kadar opsiyonel | Sonraki |
| İş ilanı arama ve filtreleme | PostgreSQL full-text search ve indeksler | Temel |
| Şirket dizini ve doğrulama | Korunur; doğrulama operasyonu gerekir | Temel |
| Freelance alanı | Korunur; ilk sürümde ilan türü olarak modellenebilir | Temel veya sonraki karar |
| Aday paneli ve CV çıkarımı | Panel temel; AI ayrıştırma onaylı öneri olarak | Temel + AI |
| CV builder | Korunur | Sonraki |
| İşveren dashboard'u | Korunur | Temel |
| Ücretli ilan paketleri | Ana gelir modeli | Temel |
| KKTC Çalışma Bakanlığı API'si | Gereksinim korunur; resmî erişim doğrulanmadan canlı entegrasyon iddia edilmez | Erişim kararı |
| LLM tabanlı CV ayrıştırma | Korunur; gizlilik, güvenli dosya işleme ve kullanıcı onayıyla | Sonraki |
| AI destekli sohbet ve otomatik çeviri | Korunur; sağlayıcı ve veri işleme kararı sonrası | Sonraki |
| TR, EN, RU, EL, FA, DE, HE | Yedi dil hedefi korunur | Aşamalı |
| Cloudflare R2/benzeri nesne depolama | Opsiyon korunur; ölçüm sonrası karar | Karar bekliyor |
| pgvector, çeviri cache'i, auth hooks | Yalnızca somut ihtiyaç varsa eklenir | İhtiyaca bağlı |
| Playwright E2E ve görsel testler | Korunur | CI/üretim öncesi |
| `.vscode` düşük maliyetli arama ayarları | Korunur; güvenlik kontrolü yerine geçmez | Temel |
| `.artifacts`, `assets-src`, asset optimizasyonu | Kullanılanlar depoya alınır; kaynak 3D varlıklar build dışı tutulur | Görsel deneyim |

### Kapsam ilkeleri

- Aday ve işveren aynı kullanıcı hesabında birlikte bulunabilir; ürün kararıyla aksi belirtilmedikçe birbirini dışlayan global roller kullanılmaz.
- Gerçek IBAN, hesap sahibi, paket fiyatları, para birimi, iade koşulları ve yasal işletme bilgileri verilmemiştir. V4 bunları uydurmaz.
- Bakanlık API'si, sosyal giriş, e-posta sağlayıcısı, AI sağlayıcısı ve nesne depolama sağlayıcısı doğrulanmış/aktif kabul edilmez.
- Bu doküman hukuki görüş, finansal mutabakat kanıtı, sızma testi veya uygulama kodu değildir.

---

## 2. Mimari bağlam

```text
Browser
├── Semantic DOM / React UI
│   ├── Public job & company pages
│   ├── Candidate workspace
│   ├── Employer/company workspace
│   ├── Payment/order status
│   └── Restricted admin operations
└── Optional Three.js Experience
    ├── Home scene / six regional nodes
    ├── GSAP timelines
    └── DOM ↔ 3D bridge (visual state only)

Next.js server
├── Session validation
├── Authorization / Data Access Layer (DAL)
├── Feature modules
│   ├── identity & profiles
│   ├── companies & memberships
│   ├── jobs & applications
│   ├── billing & manual IBAN reconciliation
│   ├── credit ledger
│   ├── resumes & parsing
│   ├── notifications & chat
│   └── ministry integration adapter
└── Supabase clients
    ├── User-scoped client (normal operations)
    └── Restricted trusted operations (narrow, server-only)

Supabase
├── PostgreSQL
│   ├── constraints / transactions / migrations
│   ├── RLS / grants
│   └── pgTAP tests
├── Auth
└── Storage
    ├── private-resumes
    ├── private-payment-receipts
    └── public-company-assets
```

### Mimari kararlar

- **Modüler monolit:** Bir deploy edilebilir uygulama; domain sınırları klasörlerden ibaret kalmaz. Modül dışındaki kod, başka modülün tablolarını doğrudan değiştiremez; modülün açık servis/fonksiyon arayüzünü kullanır.
- **DAL:** Sunucu tarafındaki veri erişimi ve yetki kontrolleri tek bir yerde toplanır. DTO'lar yalnızca gerekli alanları döndürür.
- **Yetki katmanları:** UI/route yönlendirmesi yalnızca kullanıcı deneyimidir. Güvenlik kontrolü DAL ve veritabanı seviyesinde yapılır.
- **PostgreSQL:** Veri bütünlüğü, para ve kredi işlemleri için nihai otoritedir.
- **3D ayrımı:** 3D katmanı iş kuralları, ödeme durumu veya yetki kararı vermez.
- **Harici servisler:** Adaptör arayüzleri üzerinden bağlanır; servis yokken temel ürün işlevleri çalışır.
- **Arama:** İlk aşamada PostgreSQL full-text search; ayrı motor ancak ölçülen gereksinimle eklenir.

---

## 3. Önerilen dizin yapısı

```text
isbulkktc/
├── docs/
│   ├── architecture-v4.md
│   ├── threat-model.md
│   ├── data-retention.md
│   ├── performance-budget.md
│   ├── runbooks/
│   │   ├── payment-reconciliation.md
│   │   ├── incident-response.md
│   │   └── restore-drill.md
│   └── decisions/                 # ADR kayıtları
├── public/
│   ├── locales/
│   └── decoders/                  # Gerekliyse optimize edilmiş decoder dosyaları
├── assets-src/                    # Kaynak modeller; doğrudan kullanıcıya sunulmaz
├── scripts/
│   ├── optimize-assets.ts
│   └── shot.ts
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/                     # pgTAP/RLS ve veri bütünlüğü testleri
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (auth)/
│   │   ├── (candidate)/
│   │   ├── (company)/
│   │   ├── (admin)/
│   │   └── api/
│   ├── features/
│   │   ├── identity/
│   │   ├── companies/
│   │   ├── jobs/
│   │   ├── applications/
│   │   ├── billing/
│   │   ├── credit-ledger/
│   │   ├── resumes/
│   │   ├── chat/
│   │   └── ministry/
│   ├── server/
│   │   ├── auth/
│   │   ├── dal/
│   │   ├── policies/
│   │   ├── db/
│   │   └── audit/
│   ├── experience/                # Three.js, görsel alan
│   ├── components/
│   ├── content/
│   ├── config/
│   └── types/
└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    ├── security/
    └── visual/
```

Dizin yapısı güvenlik kanıtı değildir. Önemli olan import sınırlarının, yetki testlerinin ve veritabanı kurallarının CI'da doğrulanmasıdır.

---

## 4. Güven sınırları ve tehdit modeli

### 4.1 Güvenilmeyen girdiler

Aşağıdakilerin tamamı doğrulanmadan güvenilir sayılmaz:

- Tarayıcıdan gelen rol, kullanıcı kimliği, şirket kimliği, fiyat, kredi adedi, süre ve ödeme durumu.
- Kullanıcının yüklediği CV, dekont, profil fotoğrafı ve metin.
- AI tarafından çıkarılan alanlar, çeviriler ve sınıflandırmalar.
- Dış API yanıtları, webhook'lar ve kullanıcı tarafından bildirilen banka referansları.
- İstemci tarafındaki 3D/DOM olayları ve yönlendirme bilgileri.

### 4.2 Yüksek riskli varlıklar

- Kullanıcı kimlik ve oturumları.
- CV'ler, başvurular, iletişim bilgileri ve mesajlar.
- Şirket belgeleri ve doğrulama kayıtları.
- Gerçek IBAN/hesap talimatı ve ödeme kanıtları.
- Siparişler, kredi defteri ve yönetici kararları.
- Secret/service-role anahtarları ve dış servis kimlik bilgileri.

### 4.3 Temel saldırı senaryoları ve kontroller

| Tehdit | Zorunlu kontrol | Doğrulama |
|---|---|---|
| Kullanıcı kendi rolünü admin yapar | Rol atama kullanıcı yazımına kapalı; dar yönetici prosedürü | Normal kullanıcıyla rol değiştirme denemesi reddedilir |
| Şirket A, Şirket B verisini okur | Her sorguda üyelik + izin; RLS ve DAL | Başka şirkete ait ID ile okuma/yazma reddedilir |
| İstemci fiyatı değiştirir | Fiyat ve paket snapshot'ı sunucuda hesaplanır | Değiştirilmiş fiyatla sipariş testi |
| Aynı ödeme iki kez onaylanır | Kilitleme, durum kontrolü, unique constraint ve tek transaction | Paralel istek testi; tek tahsis |
| Aynı banka referansı yeniden kullanılır | Normalize edilmiş banka referansı üzerinde uygun benzersizlik politikası | Aynı referansın ikinci kullanımında inceleme/ret |
| Dekont URL'si sızar | Özel bucket, kısa süreli URL ve sahiplik kontrolü | Yetkisiz kullanıcı dosyayı alamaz |
| Zararlı dosya yüklenir | Allowlist, imza/MIME/uzantı kontrolü, boyut limiti, karantina/tarama | Zararlı/bozuk/yanlış türlü örnekler reddedilir |
| Spam ve brute force | Endpoint bazlı rate limit, abuse kontrolü ve alarm | Eşik aşımı test edilir |
| Admin hesabı ele geçirilir | MFA, minimum ayrıcalık, kritik işlem logları; yüksek riskte ikinci onay kararı | MFA ve olay müdahalesi provası |
| Dış API kesilir | Timeout, sınırlı retry, circuit breaker/manuel fallback gerektiği yerde | Simüle edilmiş servis kesintisi |

### 4.4 Yönetici güvenliği

- Yönetici rolü kayıt formu veya normal profil güncellemesiyle atanamaz.
- Yönetici hesabı için MFA zorunlu hedefidir; desteklenmiyorsa üretim engelidir.
- Ödeme onayı, IBAN talimatı değişimi, kredi düzeltmesi ve şirket doğrulama kararı audit log gerektirir.
- Audit log uygulama kullanıcılarından değiştirilemez/silinemez; yalnızca güvenilir yazma yoluyla eklenir. Yüksek yetkili DB operatörlerinin mutlak erişimi ayrı operasyon riski olarak belgelenir.
- Tek kişilik ekipte ikinci onay operasyonel olarak mümkün olmayabilir. Bu nedenle en azından tutar/referans doğrulaması, benzersizlik, MFA ve geri alınabilir/izlenebilir karar geçmişi gerekir. Çift onay gereksinimi risk ve işletme politikasına göre açıkça kararlaştırılır.

---

## 5. Kimlik ve yetki modeli

### 5.1 Kimlik ile rolü ayır

- **Kimlik doğrulama:** Kullanıcının kim olduğu.
- **Global platform rolü:** `candidate`, `platform_admin` gibi platform düzeyindeki rol.
- **Şirket üyeliği rolü:** Belirli bir `company_id` içinde `owner`, `recruiter`, `billing`, `viewer`.
- **Kaynak erişimi:** Belirli ilan, başvuru, CV veya konuşmaya erişim şartı.

Bir kişinin `employer` olması herhangi bir şirketi görme izni vermez. Şirket kapsamındaki her işlem, aktif üyelik ve izin kontrolü yapar.

### 5.2 Yetki matrisi

| Kaynak/işlem | Ziyaretçi | Aday | Şirket üyesi | Platform yöneticisi |
|---|---|---|---|---|
| Yayındaki ilanı okuma | Evet | Evet | Evet | Evet |
| Taslak ilanı okuma | Hayır | Hayır | Yalnız yetkili şirket | Gerektiği kadar |
| Kendi profili/CV'si | Hayır | Kendi verisi | Hayır; başvuru bağlamı/izin hariç | Destek amacıyla sınırlı |
| Başvuru oluşturma | Hayır | Kendi adına | Hayır | Operasyonel istisna loglanır |
| Başvuruları görüntüleme | Hayır | Kendi başvurusu | Üyesi olduğu şirketin yetkili ilanları | Gerektiği kadar |
| Şirket üyeliği yönetimi | Hayır | Hayır | Owner/izinli admin | Destek ve güvenlik politikasıyla |
| Paket kataloğu okuma | Evet | Evet | Evet | Evet |
| Sipariş oluşturma | Hayır | Hayır | Yetkili şirket üyeleri | Normalde gerekmez |
| Ödeme bildirimi gönderme | Hayır | Hayır | Siparişin şirket üyeleri | Normalde gerekmez |
| Ödeme onayı | Hayır | Hayır | Hayır | Özel `billing_admin` yetkisi |
| Kredi düzeltme | Hayır | Hayır | Hayır | Ayrı yetki + gerekçe + audit |
| Admin rolü atama | Hayır | Hayır | Hayır | Normal admin kendi kendine atayamaz; güvenilir operasyon prosedürü |

Bu tablo başlangıç sözleşmesidir. Özellikle yönetici alt rolleri, şirket sahibi değişimi ve destek erişimi uygulamadan önce ürün sahibince onaylanmalıdır.

### 5.3 Sunucu tarafı kuralı

Her Server Action ve Route Handler şu sırayı izler:

1. Girdi şemasını doğrula.
2. Oturumu sunucu tarafında doğrula.
3. Gerekli global rolü, şirket üyeliğini ve kaynak ilişkisini kontrol et.
4. İş kuralını doğrula.
5. Veri değişikliğini transaction/kısıtlarla gerçekleştir.
6. Yalnızca gerekli alanları DTO ile döndür.
7. Kritik olayı hassas veri sızdırmadan audit log'a yaz.

UI'da düğmeyi gizlemek yetkilendirme değildir. Next.js resmî rehberindeki DAL ve DTO yaklaşımı hedef alınır.

---

## 6. Veri modeli — V4

### 6.1 Ortak kurallar

- Birincil anahtarlar UUID; ilişkilerde foreign key.
- Durum alanları enum veya `CHECK` constraint ile sınırlandırılır.
- Fiyat ve tutarlar kayan nokta değil, tam sayı minor unit ve açık ISO para birimi koduyla tutulur. Desteklenecek para birimi ürün kararıdır.
- `created_at`, gereken yerde `updated_at`, `created_by` ve `updated_by` bulunur.
- Silme davranışı ilişkilerin iş anlamına göre `RESTRICT`, `CASCADE` veya soft-delete olarak açıkça seçilir; ödeme/audit geçmişi fiziksel olarak silinmez.
- `updated_at` uygulama standardı/trigger ile tutarlı güncellenir.
- Her migration tekrarlanabilir, gözden geçirilebilir ve CI'da uygulanabilir olmalıdır.

### 6.2 Kimlik, şirket ve iş ilanı tabloları

| Tablo | Temel alanlar | Kritik kurallar |
|---|---|---|
| `profiles` | `id`, `display_name`, `locale`, `status` | `id` Auth kullanıcı ID'siyle eşleşir |
| `user_roles` | `user_id`, `role`, `granted_by`, `created_at` | İstemci yazamaz; admin ataması özel prosedür |
| `candidate_profiles` | `user_id`, `headline`, `location`, `skills`, `visibility` | Aday yalnız kendi profilini değiştirir |
| `resumes` | `id`, `candidate_id`, `storage_path`, `status`, `retention_until` | Storage yolu benzersiz; özel erişim |
| `resume_versions` | `id`, `resume_id`, `version`, `structured_data` | Sürüm aynı CV içinde benzersiz; hassas veri |
| `companies` | `id`, `name`, `slug`, `verification_status` | Slug benzersiz; doğrulama kararı audit |
| `company_members` | `company_id`, `user_id`, `membership_role`, `status` | `(company_id,user_id)` benzersiz; aktif üyelik kontrolü |
| `jobs` | `id`, `company_id`, `slug`, `title`, `job_type`, `status`, `expires_at` | İlan şirket kapsamına bağlı; yayınlama kuralı |
| `applications` | `id`, `job_id`, `candidate_id`, `resume_id`, `status` | İş kuralı kararıyla `(job_id,candidate_id)` benzersiz |
| `saved_jobs` | `user_id`, `job_id`, `created_at` | `(user_id,job_id)` benzersiz |
| `notifications` | `id`, `user_id`, `type`, `payload`, `read_at` | Yalnız sahibine görünür |
| `conversations` | `id`, `status`, `created_at` | Üyelik ilişkisi olmadan mesaj okunamaz |
| `conversation_members` | `conversation_id`, `user_id`, `role` | `(conversation_id,user_id)` benzersiz |
| `messages` | `id`, `conversation_id`, `sender_id`, `body`, `created_at` | Gönderen konuşma üyesi olmalı |
| `integration_sync_runs` | `id`, `integration`, `status`, `started_at`, `finished_at` | Token/secret loglanmaz |

### 6.3 Paket, sipariş ve ödeme tabloları

| Tablo | Temel alanlar | Kritik kurallar |
|---|---|---|
| `job_packages` | `id`, `code`, `price_minor`, `currency`, `job_credits`, `duration_days`, `is_active` | `code` benzersiz; geçmiş sipariş varken paket silinmez, devre dışı bırakılır |
| `orders` | `id`, `company_id`, `status`, `total_minor`, `currency`, `reference_code`, `package_snapshot`, `payment_instructions_version_id`, `expires_at` | Referans benzersiz; fiyat istemciden alınmaz |
| `payment_submissions` | `id`, `order_id`, `submitted_by`, `sender_name`, `transfer_reference`, `amount_minor`, `currency`, `transferred_at`, `receipt_storage_path`, `status` | Her gönderim ayrı izlenir; istemci `accepted` yazamaz |
| `payment_reconciliations` | `id`, `order_id`, `submission_id`, `reviewed_by`, `decision`, `bank_reference_normalized`, `notes`, `reviewed_at` | Yetkili karar; karar ve aktör audit edilir |
| `payment_instruction_versions` | `id`, `beneficiary_name`, `bank_name`, `iban_restricted_value`, `currency`, `instructions`, `active_from`, `active_to`, `created_by` | Erişim kısıtlı; eski sipariş talimatı değişmez |
| `credit_accounts` | `company_id`, `available_balance`, `updated_at` | Hızlı bakiye görünümü; hareket defteriyle tutarlı tutulur |
| `credit_ledger_entries` | `id`, `company_id`, `order_id`, `job_id`, `entry_type`, `quantity_delta`, `idempotency_key`, `actor_id`, `reason`, `created_at` | Eklemeli geçmiş; idempotency key benzersiz |
| `audit_logs` | `id`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata_redacted`, `created_at` | Kullanıcı tarafından değiştirilemez; hassas sırlar içermez |
| `outbox_events` | `id`, `event_type`, `aggregate_id`, `payload_minimal`, `created_at`, `published_at` | Transaction sonrası bildirimlerin kaybolmasını azaltır; retry idempotent |

### 6.4 Önerilen veri bütünlüğü kısıtları

Aşağıdaki kurallar migration'larda uygulanmalı; adlar örnektir:

- `orders.reference_code` üzerinde `UNIQUE`.
- Paket `price_minor >= 0`, `job_credits > 0`, `duration_days > 0`.
- Sipariş `total_minor >= 0`; para birimi boş olamaz.
- Kredi defterinde `quantity_delta <> 0`; yalnız tanımlı `entry_type` değerleri.
- `credit_ledger_entries.idempotency_key` üzerinde `UNIQUE`.
- Ödeme onayıyla oluşan kredi tahsisi için siparişe/işlem türüne göre tekil bir benzersiz iş anahtarı.
- Banka hareketi referansı mevcutsa, normalize edilmiş değer üzerinde uygun kapsamlı benzersizlik. Banka referansları küresel olarak benzersiz olmayabileceği için kapsam (banka/hesap/tarih/tutar) iş politikasıyla belirlenir; tek başına varsayılmaz.
- `company_members(company_id,user_id)` benzersiz.
- `saved_jobs(user_id,job_id)` benzersiz.
- `messages.sender_id` ile `conversation_members` üyeliği işlem anında doğrulanır.
- `jobs.expires_at > published_at` gibi tarih kuralları, ilgili durumlar için uygulanır.
- Kullanıcı tarafından gönderilen `status`, `role`, `price`, `credit balance` gibi güvenilir alanlar doğrudan yazılabilir API'ye açılmaz.

---

## 7. IBAN sipariş durum makinesi

### 7.1 Sipariş durumları

- `awaiting_transfer`: Sipariş oluşturuldu, transfer bekleniyor.
- `payment_submitted`: Kullanıcı transfer bildirimi gönderdi.
- `payment_under_review`: Yetkili incelemesi gerekiyor.
- `paid`: Banka hareketi doğrulandı ve tek seferlik tahsis tamamlandı.
- `rejected`: Gönderim reddedildi; sipariş yeniden bildirim veya iptal politikasına göre devam eder.
- `expired`: Son ödeme zamanı geçti.
- `cancelled`: İzin verilen kurala göre iptal edildi.
- `refund_pending`: İade kararı verildi, para iadesi henüz doğrulanmadı.
- `refunded`: İade gerçekten gerçekleştirildi ve kaydedildi.

`payment_submissions.status` ayrı bir alt süreçtir: `submitted`, `under_review`, `accepted`, `rejected`, `needs_more_information`. Sipariş ve gönderim durumlarının aynı şeyi farklı şekilde ifade etmesi engellenmelidir.

### 7.2 Geçiş tablosu

| Mevcut durum | Olay | Yeni durum | Kim yapabilir? | Ek şart |
|---|---|---|---|---|
| `awaiting_transfer` | Bildirim gönderildi | `payment_submitted` | Siparişin yetkili şirket üyesi | Sipariş açık ve süresi geçmemiş |
| `payment_submitted` | İnceleme başlatıldı | `payment_under_review` | Yetkili operasyon | Bildirim mevcut |
| `payment_under_review` | Banka hareketi doğrulandı | `paid` | Ödeme mutabakat yetkisi | Tutar/para birimi/referans ve banka kaydı eşleşir |
| `payment_under_review` | Kanıt yetersiz | Aynı/ek bilgi durumu | Yetkili operasyon | Gerekçe kaydedilir |
| İnceleme durumu | Reddedildi | `rejected` | Ödeme mutabakat yetkisi | Gerekçe zorunlu |
| Açık sipariş | Son ödeme zamanı geçti | `expired` | Güvenilir sunucu işi | `paid` olmamış olmalı |
| Açık sipariş | İzinli iptal | `cancelled` | Yetkili şirket üyesi/operasyon | İşletme politikasına uygun |
| `paid` | İade kararı | `refund_pending` | Ayrı iade yetkisi | İade nedeni ve tutarı kaydedilir |
| `refund_pending` | İade banka kaydı doğrulandı | `refunded` | Yetkili operasyon | Kredi düzeltmesiyle tutarlı |

`paid` durumu, yalnızca bir onay etiketi değildir: siparişin banka hareketi doğrulamasını ve gerekli paket hakkı tahsisinin aynı güvenilir işlemde tamamlanmasını temsil eder.

### 7.3 Mutabakat transaction sözleşmesi

Bir ödeme onayı aşağıdaki mantığı tek veritabanı transaction'ında gerçekleştirmelidir:

1. İlgili sipariş satırını `SELECT ... FOR UPDATE` veya eşdeğer atomik koşullu güncelleme ile kilitle.
2. Siparişin hâlâ `payment_under_review` durumunda olduğunu doğrula.
3. Yetkili aktör ve gönderim/sipariş ilişkisini doğrula.
4. Tutar, para birimi, banka hareketi referansı ve sipariş referansının eşleşmesini kontrol et.
5. Banka hareketinin başka bir siparişe bağlanmadığını kontrol et.
6. Mutabakat kararını yaz.
7. Siparişi `paid` durumuna geçir.
8. `credit_ledger_entries` içine benzersiz idempotency anahtarıyla tahsis kaydı ekle.
9. `credit_accounts` bakiyesini aynı transaction içinde güncelle.
10. `audit_logs` ve gerekiyorsa `outbox_events` kaydı ekle.
11. Herhangi bir adım başarısız olursa tüm transaction geri alınır.

İşlem tekrarlanırsa aynı başarı sonucu güvenle döndürülebilir veya “zaten işlendi” yanıtı verilebilir; ikinci tahsis yapılamaz. Bu garantiler yalnızca uygulama kodu kontrolüyle değil, DB constraint'leri ve paralel istek testleriyle sağlanır.

### 7.4 Manuel IBAN operasyon kuralları

- Dekont, kullanıcı beyanı ve transfer referansı tek başına ödeme kanıtı değildir.
- Banka hareketi gerçekten kontrol edilmeden sipariş `paid` yapılamaz.
- Otomatik banka API'si/feed'i/webhook'u yoksa varmış gibi davranılmaz.
- Aynı transferin birden fazla siparişte kullanılması engellenir veya incelemeye alınır.
- Eksik/fazla ödeme, banka masrafı, üçüncü kişi hesabından transfer, yinelenen ödeme, yanlış para birimi, geç transfer, iptal ve iade kuralları yazılı olmalıdır.
- İşletme hesabı sahibi, IBAN, banka, para birimi ve yasal alıcı doğrulanmadan gerçek talimat yayımlanmaz.
- Ödeme talimatı değişimi sürümlenir; eski siparişin snapshot'ı değişmez.
- Kullanıcıya otomatik/anında onay vaat edilmez; operasyonun gerçek SLA'sı açıklanır.
- Admin notlarında gereksiz tam banka verisi, CV veya sır saklanmaz.

---

## 8. Kredi hareket defteri ve ilan yayınlama

### 8.1 Hareket türleri

- `purchase_grant`: Onaylı siparişten kredi tahsisi.
- `job_consume`: İlan yayınlama için kredi tüketimi.
- `job_refund`: İlan iptal/ret politikasına göre kredi iadesi.
- `manual_adjustment`: Gerekçeli yönetici düzeltmesi.
- `expiry`: Süresi dolan kredinin düşülmesi (paket kuralı varsa).
- `reversal`: Önceki bir kaydın ters hareketi; orijinal kayıt silinmez.

Her kayıt pozitif veya negatif `quantity_delta`, `entry_type`, şirket, ilişkilendirilen sipariş/ilan, aktör, gerekçe ve benzersiz `idempotency_key` taşır. Ledger satırları update/delete ile değiştirilemez; hata, ters kayıtla düzeltilir.

### 8.2 İlan yayınlama transaction'ı

1. Kullanıcı oturumu ve şirket üyeliği doğrulanır.
2. Üyelik rolünün ilan yayımlama izni kontrol edilir.
3. Şirket doğrulama ve ilan moderasyon koşulları kontrol edilir.
4. Kullanılabilir kredi transaction içinde kilitlenir veya atomik koşullu güncellenir.
5. İlan yayınlanır ve tek bir `job_consume` hareketi eklenir.
6. Paket süresine göre `expires_at` sunucuda hesaplanır.
7. İşlem bütünüyle başarılı olur veya geri alınır.

Reddedilen/silinen ilan için otomatik iade yapılıp yapılmayacağı ürün politikasıdır. Politika netleşmeden sistem varsayılan iade yapmamalı veya krediyi sessizce yakmamalıdır.

---

## 9. RLS, SQL izinleri ve Storage politikaları

### 9.1 Her tablo için standart

1. İstemci erişimine açık şemadaki her tablo için RLS etkinleştirilir.
2. `anon` ve `authenticated` grant'leri ihtiyaç kadar daraltılır.
3. Her `SELECT`, `INSERT`, `UPDATE`, `DELETE` için gerekli politika açıkça tanımlanır.
4. Normal kullanıcılar `user_roles`, `orders.status`, `credit_accounts`, `credit_ledger_entries`, `payment_reconciliations` gibi güvenilir iş durumu tablolarını doğrudan değiştiremez.
5. Admin/ödeme işlemleri mümkünse sınırlı parametre alan, `SECURITY DEFINER` kullanılıyorsa sabit ve güvenli `search_path` ile tasarlanmış, execute izni daraltılmış veritabanı fonksiyonları üzerinden yapılır.
6. Fonksiyonlar tablo sahipliği/rol yetkisi ve RLS davranışı açısından ayrıca test edilir.
7. Service-role/secret anahtarları yalnız sunucuda saklanır; `NEXT_PUBLIC_` değişkenlerine, istemci bundle'ına veya loglara girmez.
8. Kullanıcı kapsamlı sorgular kullanıcı oturum bağlamıyla çalışır. Yüksek yetkili istemci, sıradan veri erişimi için gelişigüzel kullanılmaz.
9. Storage nesnesi yolu tahmin edilemez olsa bile yetki kontrolü yapılır.
10. Her RLS değişikliği, aynı migration/PR içinde pozitif ve negatif testlerle gelir.

### 9.2 Gerekli RLS test matrisi

| Aktör | Kendi kaydı | Başka aday | Kendi şirketi | Başka şirket | Admin ödeme işlemi |
|---|---|---|---|---|---|
| Anonim | Engelli/yalnız public içerik | Engelli | Engelli | Engelli | Engelli |
| Aday A | İzinli | Engelli | Üyeliği yoksa engelli | Engelli | Engelli |
| Şirket A üyesi | İzinli | Aday özel verisi engelli; izinli başvuru bağlamı ayrı | Rolüne göre | Engelli | Engelli |
| Şirket A sahibi | Kendi kaydı | Yetkili başvuru bağlamı dışında engelli | Yönetim izinleri | Engelli | Engelli |
| Platform admin | Görev kapsamıyla | Görev kapsamıyla, audit | Görev kapsamıyla | Görev kapsamıyla | Özel yetki + audit |

“Platform admin her şeyi okuyabilir” varsayımı sınırsız ve sessiz erişim anlamına gelmemelidir. Destek erişimi ihtiyaç ve politika ile sınırlandırılır; hassas verilere erişim loglanır.

### 9.3 Storage güvenliği

- `private-resumes` ve `private-payment-receipts` özel bucket'lardır.
- `public-company-assets` yalnızca herkese açık olması gereken dosyalar içindir.
- İzin verilen dosya türleri iş gereksinimiyle sınırlıdır; uzantı, MIME ve dosya imzası kontrol edilir.
- Dosya boyutu ve kullanıcı başına hız/alan sınırı uygulanır.
- Sunucu tarafından rastgele nesne anahtarı üretilir; kullanıcı dosya yolunu belirleyemez.
- CV/dekont indirme öncesi sahiplik ve iş ilişkisi doğrulanır. İmzalı URL gerekiyorsa kısa ömürlüdür ve hassas loglara yazılmaz.
- Üretim riskine göre zararlı yazılım taraması/karantina ve PDF/DOCX içerik temizleme değerlendirilir.
- Yüklenen dosya doğrudan sunucu kodu gibi çalıştırılmaz.
- Dosya silme ve saklama süresi uygulanır; yedeklerde kalan kopyalar için ayrı retention politikası belirlenir.

---

## 10. CV ayrıştırma, AI ve kişisel veri

- AI ayrıştırma sonraki aşama özelliğidir; ilk sürümde zorunlu değildir.
- CV yüklemesi `queued → processing → succeeded/failed` kontrollü durumlarıyla izlenir.
- Ayrıştırıcı mümkünse izole işçi/işlem ortamında çalışır; kaynak ve süre sınırı uygulanır.
- AI çıktısı öneri olarak sunulur. Aday alanları gözden geçirip onaylayabilir/düzeltebilir.
- AI tek başına işe alım/eleme kararı vermez.
- Harici AI sağlayıcısına yalnızca gerekli alanlar gönderilir. Veri saklama, model eğitimi kullanımı, bölge ve sözleşme şartları doğrulanmadan hassas CV verisi gönderilmez.
- Prompt injection içerebilecek CV metni güvenilmeyen veri sayılır; modelin sistem talimatlarını değiştiremez ve ayrıcalıklı araçlara doğrudan erişemez.
- Hesap kapatma, CV silme, veri dışa aktarma, başvuru saklama ve log retention politikaları yazılı hale getirilir.
- KKTC/Türkiye ve uygulanabilir diğer veri koruma yükümlülükleri uzman hukuk incelemesiyle doğrulanır. Bu doküman hukuki görüş değildir.

---

## 11. 3D deneyimi, erişilebilirlik ve performans

### 11.1 Görsel mimari

- Three.js `Experience` katmanı, DOM iş mantığından ayrıdır.
- DOM ↔ 3D bridge yalnızca route değişimi, seçili bölge ve normalize edilmiş görsel zaman gibi sınırlı mesajlar taşır.
- WebGPU/TSL zorunlu taban değildir. Desteklenen cihazlarda opt-in enhancement; diğer durumlarda WebGL veya DOM/statik fallback.
- 3D hata verirse ilan arama, başvuru, oturum ve ödeme sayfaları çalışmayı sürdürür.
- `prefers-reduced-motion` uygulanır; otomatik kamera hareketi ve scroll animasyonları azaltılır.
- Sekme görünmez olduğunda render döngüsü durdurulur veya düşürülür.
- Kaynak 8K texture ve ham model dosyaları doğrudan kullanıcılara servis edilmez; optimize edilmiş GLB, KTX2, Draco/Meshopt pipeline ölçümle kullanılır.
- Klavye, ekran okuyucu, görünür odak, kontrast ve semantik HTML temel gereksinimdir.

### 11.2 Performans hedefleri

Core Web Vitals alan verisi varsa 75. yüzdelikte hedeflenir:

- **LCP:** ≤ 2,5 saniye
- **INP:** ≤ 200 ms
- **CLS:** ≤ 0,1

Bunlar ölçülmüş sonuç değil, kabul hedefidir.

Ek başlangıç bütçeleri (prototipte ölçülüp yeniden belirlenmeli):
- Temel iş akışları 3D yüklenmesini beklemez.
- İlk işlevsel içerik için gereksiz 3D bundle yüklenmez.
- 3D varlıkları rota/cihaz durumuna göre lazy-load edilir.
- Ana sayfada düşük donanım ve mobil ağ profili test edilir.
- Başvuru ve ödeme akışında konsol hatası, kaybolan form verisi veya sonsuz yükleme kabul edilmez.

Kesin JS/asset KB sınırları ilk gerçek build ve hedef cihaz ölçümü sonrası ADR ile sabitlenir; ölçüm olmadan keyfî bir “kesin” sayı garanti edilmez.

---

## 12. Çok dilli mimari ve arama

### Diller

Orijinal hedef korunur: Türkçe, İngilizce, Rusça, Yunanca, Farsça, Almanca ve İbranice.

- İlk yayın dili Türkçe olabilir; diğer diller için içerik ve QA aşamalı yapılır.
- Arayüz dili, ilan içeriğinin dili ve arama sorgusu dili ayrı alanlardır.
- Farsça ve İbranice için RTL düzeni; ikon, hizalama, form, sayı ve karışık yönlü metin testleri yapılır.
- URL/locale stratejisi, canonical ve `hreflang`, yerelleştirilmiş metadata, sitemap ve fallback kuralları önceden belirlenir.
- Makine çevirisi, insan tarafından doğrulanmış çeviri gibi etiketlenmez.

### Arama

- İlk sürümde PostgreSQL full-text search ve ölçüme dayalı indeksler.
- Konum, sektör, iş türü, çalışma şekli, dil ve yayın durumu filtreleri şemayla uyumlu olmalı.
- İlanlar yalnız `published` ve süresi geçmemiş durumlarda public arama sonuçlarına girer.
- Dil bazlı arama kalitesi için örnek sorgu seti oluşturulur.
- Harici arama motoru yalnızca ölçülen gecikme/özellik ihtiyacı karşılanmıyorsa eklenir.
- İlan arama sorguları ve loglar gereksiz kişisel veri tutmaz.

---

## 13. Harici entegrasyonlar

### Bakanlık API'si

Orijinal gereksinim korunur; canlı entegrasyon varmış gibi sunulmaz. Ön koşullar:

1. Resmî API ve güncel dokümantasyonun doğrulanması.
2. Yazılı erişim izni, kimlik doğrulama ve kullanım şartları.
3. İzinli alanlar ve veri güncelliğinin doğrulanması.
4. Timeout, rate limit, retry ve servis kesintisi davranışı.
5. Kaynak ve son senkronizasyon zamanının kullanıcıya gösterilmesi.
6. Entegrasyon çalışmadığında temel platformun kullanılabilir kalması.

### Sosyal giriş, e-posta, AI ve depolama

Her sağlayıcı için maliyet, veri işleme, secrets yönetimi, erişim izinleri, SLA ve çıkış/alternatif planı kayda geçirilir. Bağlantı kurulmadan ve test edilmeden entegrasyon aktif sayılmaz.

---

## 14. Gözlemlenebilirlik, yedekleme ve kurtarma

### Gözlemlenebilirlik

- Yapılandırılmış loglar, korelasyon/request ID ve hata izleme.
- Parola, token, secret, tam CV içeriği, tam dekont ve gereksiz banka verisi loglanmaz.
- Önemli metrikler: HTTP 5xx, ödeme inceleme kuyruğu yaşı, başarısız upload/parse, sorgu gecikmesi, background retry, kredi/ledger tutarsızlığı.
- Kritik olay alarmları: beklenmeyen admin rol değişikliği, çok sayıda ödeme reddi, aynı banka referansı tekrarları, başarısız migration, backup/restore hatası.

### RPO/RTO

Ürün sahibiyle onaylanması gereken başlangıç önerisi:
- **RPO hedefi:** En fazla 24 saat veri kaybı (otomatik yedekleme planına bağlı; daha düşük hedef için daha sık/PITR yedeği gerekir).
- **RTO hedefi:** Kritik işlevlerin 8 saat içinde geri getirilmesi.
- Bu hedefler mevcut plan/abonelik ve gerçek yedekleme kabiliyeti doğrulanmadan garanti değildir.

### Zorunlu operasyon çalışmaları

- Yedekleme ve retention yapılandırmasını belgelemek.
- Ayrı test ortamına gerçekçi bir geri yükleme provası yapmak.
- Migration rollback/forward-fix prosedürünü belgelemek.
- Admin erişimi kaybı, secret sızıntısı, ödeme uyuşmazlığı ve dış servis kesintisi için runbook hazırlamak.
- Üretim anahtarları ile preview/development anahtarlarını ayırmak.
- Bir kişinin erişilemez olduğu senaryoda kritik hesap kurtarma prosedürünü tanımlamak.

---

## 15. Test stratejisi ve kabul kriterleri

### 15.1 Test katmanları

- **Unit:** Şema doğrulama, durum geçişleri, fiyat hesaplama, paket snapshot, kredi politikaları.
- **Database integration:** Foreign key, check/unique constraint, transaction, kredi defteri, ödeme idempotency.
- **RLS/pgTAP:** Her tabloda anon/authenticated allow/deny senaryoları.
- **API/security:** IDOR, rol yükseltme, CSRF uygunluğu, rate limit, dosya erişimi, girdi doğrulama.
- **E2E/Playwright:** Kayıt → şirket oluşturma/doğrulama → paket → sipariş → IBAN bildirimi → yönetici mutabakatı → kredi → ilan yayımlama.
- **Visual:** Mobil/masaüstü ve 3D fallback ekran görüntüleri.
- **Load:** Arama, ilan listeleme, başvuru ve ödeme bildirimi için gerçekçi yük.
- **Recovery:** Yedekten geri yükleme ve migration provası.

### 15.2 Üretim öncesi zorunlu kabul kapıları

| Kapı | Geçme ölçütü | Başarısızsa |
|---|---|---|
| Yetkilendirme | Tüm kritik kaynaklar için pozitif ve negatif test geçer | Yayın engellenir |
| RLS/SQL izinleri | Tüm exposed tablolar kapsanır; `supabase test db` başarılı | Yayın engellenir |
| Admin rolü | Normal kullanıcı rol yükseltemez; admin MFA doğrulanır | Yayın engellenir |
| IBAN onayı | Paralel onayda tek `paid` sonucu ve tek kredi tahsisi | Yayın engellenir |
| Referans tekrar kullanımı | Aynı transferin iki siparişe bağlanması engellenir veya incelemeye düşer | Yayın engellenir |
| Kredi defteri | Bakiye, hareket defteriyle yeniden hesaplanabilir ve tutarlıdır | Yayın engellenir |
| Dosya erişimi | Yetkisiz CV/dekont erişimi reddedilir; zararlı/yanlış türlü dosyalar reddedilir | Yayın engellenir |
| Gizli anahtarlar | Client bundle, repo ve loglarda secret yok | Yayın engellenir |
| Backup/restore | Restore provası başarıyla tamamlanır; RPO/RTO belgelenir | Yayın engellenir |
| Ödeme politikası | IBAN sahibi, para birimi, fiyat, süre, iade ve uyuşmazlık politikası onaylanır | Gerçek ödeme açılmaz |
| E2E kritik akış | Temel aday ve işveren akışları CI'da başarılı | Yayın engellenir |
| 3D fallback | 3D kapalı/hatalı/düşük cihazda temel görevler çalışır | 3D kapatılarak yayın değerlendirilebilir |
| Performans | Hedef cihazlarda Core Web Vitals ölçülür ve kabul hedefleri sağlanır veya sapmalar onaylanır | İyileştirme/istisna kararı |
| Hukuk/gizlilik | Gizlilik metni, saklama ve ilgili mevzuat incelemesi tamamlanır | İlgili veri işleme açılmaz |

“Test yazıldı” veya “yerelde çalıştı” demek test geçti demek değildir. CI raporu, migration çıktısı ve restore kanıtı saklanmalıdır.

---

## 16. Solo geliştirici için yol haritası

Takvim kesin tahmin değildir. Her aşama süre yerine kabul edilebilir bir sonuçla biter.

### Aşama 0 — Kararları sabitle
- Para birimi, fiyatlar, IBAN sahibi, ödeme politikaları, paket hakları.
- Şirket doğrulama ve ilan moderasyon kuralları.
- Saklama/silme politikası ve dil/URL stratejisi.
- Bakanlık API'sinin varlığı/erişim durumu.
**Çıkış kapısı:** Bilinmeyenler kayıtlı; gerçek ödeme için gerekli işletme kararları onaylı.

### Aşama 1 — Temel iskelet ve güvenlik
- Next.js, TypeScript, Tailwind, Supabase local/dev/prod ayrımı.
- Migration disiplini, env yönetimi, DAL, session ve rol modeli.
- RLS/grants matrisi ve ilk pgTAP testleri.
**Çıkış kapısı:** Anonim, aday ve şirket üyesi için negatif erişim testleri çalışıyor.

### Aşama 2 — İş ilanı dikey akışı
- Şirket üyeliği, şirket doğrulama, ilan CRUD, moderasyon, arama, başvuru.
- E2E temel akış ve mobil erişilebilirlik.
**Çıkış kapısı:** Aday başvurabilir; şirket yalnız kendi yetkili ilanlarını yönetebilir.

### Aşama 3 — Paketler ve IBAN
- Paket kataloğu, sipariş snapshot, ödeme bildirimi, özel dekont yükleme.
- Admin mutabakatı, atomik ödeme onayı, kredi defteri, audit log.
- Paralel onay ve mükerrer referans testleri.
**Çıkış kapısı:** Banka hareketi doğrulanmadan hak verilemez; aynı siparişe çift tahsis testle engellenir.

### Aşama 4 — Operasyonel sağlamlaştırma
- Rate limit, alarmlar, hata izleme, backup/restore, olay runbook'ları.
- RLS test kapsamı, güvenlik incelemesi ve üretim yapılandırması.
**Çıkış kapısı:** Tüm P0 testleri geçer; restore provası tamamlanır.

### Aşama 5 — Marka ve 3D deneyimi
- Altı bölge sahnesi, GSAP, optimize asset pipeline, mobil fallback.
- Playwright görsel regresyon ve reduced-motion.
**Çıkış kapısı:** Temel işlevler 3D kapalıyken de çalışır; performans ölçülmüştür.

### Aşama 6 — Çok dillilik ve gelişmiş özellikler
- Yedi dil, RTL, SEO, CV builder, AI ayrıştırma, sohbet/çeviri.
- Bakanlık entegrasyonu yalnız erişim doğrulanınca.
**Çıkış kapısı:** Her özellik için ayrı gizlilik, maliyet, hata ve kabul testleri.

---

## 17. Karar bekleyen konular ve varsayımlar

Aşağıdaki noktalar verilmiş bilgi değildir; ürün sahibinin onayı gerekir.

| Konu | V4 varsayımı/önerisi | Yayın öncesi karar |
|---|---|---|
| Para birimi | Kodlama tam sayı minor unit + currency alanı kullanır | Hangi para birimleri kabul edilecek? |
| IBAN | Manuel mutabakat; otomatik banka bağlantısı yok | Hesap sahibi, banka, gerçek IBAN ve yetkili kişi |
| Fiyatlar | Paket fiyatı sunucu/veritabanından gelir | Paket isimleri, fiyat, kredi ve süre |
| Üçüncü kişi ödemesi | Otomatik kabul edilmez; inceleme politikası gerekir | Kabul/ret şartları |
| Eksik/fazla ödeme | İnceleme gerektirir | İşletme ve muhasebe prosedürü |
| İade | Ayrı `refund_pending`/`refunded` akışı | İade koşulları ve kredinin geri alınması |
| Şirket doğrulama | Manuel operasyonla başlayabilir | İstenen belgeler ve SLA |
| Başvuru tekrarları | Unique kısıt ürün kararıyla uygulanır | Aynı aday aynı ilana tekrar başvurabilir mi? |
| Kredi süresi | Paket kuralından türetilir | Kullanılmayan hakların sona erme politikası |
| RPO/RTO | Başlangıç önerisi 24 saat / 8 saat | Hosting/plan kabiliyetiyle doğrulanıp onaylanır |
| Bakanlık API'si | Erişim kanıtlanana kadar kapalı/adaptör | Resmî doküman, izin ve veri kapsamı |
| AI sağlayıcısı | Seçilmiş/aktif kabul edilmez | Veri işleme ve maliyet incelemesi |
| Depolama/CDN | İlk aşamada Supabase Storage; hacim ölçülür | R2/başka sağlayıcıya geçiş eşiği |
| Yedi dil | Hedef korunur, aşamalı yayın | Çeviri sahipliği ve QA sorumlusu |

---

## 18. Definition of Done (DoD)

Bir özellik tamamlandı sayılabilmesi için:

- [ ] Ürün davranışı ve hata durumları belgelenmiş.
- [ ] Yetki kontrolleri sunucuda ve gerektiği yerde DB'de uygulanmış.
- [ ] Migration ve kısıtlar eklenmiş; geri dönüş/ileri düzeltme yaklaşımı belirlenmiş.
- [ ] Pozitif ve negatif testler yazılmış.
- [ ] Hata, retry ve idempotency davranışı belirlenmiş.
- [ ] Loglar hassas veri içermiyor.
- [ ] Erişilebilirlik ve mobil görünüm kontrol edilmiş.
- [ ] Harici servis varsa kesinti senaryosu test edilmiş.
- [ ] İlgili kabul kapısı CI'da geçmiş.
- [ ] Kullanıcı dokümantasyonu ve runbook güncellenmiş.

---

## 19. Kaynaklar ve güncel teknik doğrulama

Aşağıdaki resmî/uzman kaynaklar V4'teki güvenlik ve üretim yaklaşımını destekler. Bunlar uygulamanın kendisinin güvenli olduğunu kanıtlamaz; uygulanacak kontrol rehberleridir.

1. Next.js — Authentication, authorization, DAL ve DTO rehberi:  
   https://nextjs.org/docs/app/guides/authentication
2. Supabase — Üretime geçiş kontrol listesi:  
   https://supabase.com/docs/guides/deployment/going-into-prod
3. Supabase — Row Level Security:  
   https://supabase.com/docs/guides/database/postgres/row-level-security
4. Supabase — Database testing overview / pgTAP:  
   https://supabase.com/docs/guides/local-development/testing/overview
5. OWASP — File Upload Cheat Sheet:  
   https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

---

## 20. Nihai mimari kararı

V4'ün hedefi; tek geliştiricinin yönetebileceği, modüler monolit üzerinde çalışan, PostgreSQL veri bütünlüğünü merkez alan, yetkilendirmeyi UI görünürlüğüne bırakmayan ve manuel IBAN ödemesini güvenli bir operasyon akışı olarak ele alan bir kariyer platformudur.

**Üretime çıkış koşulu:** P0 güvenlik ve ödeme kapıları, veri bütünlüğü testleri, yedek geri yükleme provası ve işletme ödeme kararları doğrulanmadan gerçek para karşılığı paket satışı açılmaz.

**Durum:** Bu belge mimari hedefi tanımlar. Uygulamanın kodlandığını, testlerin geçtiğini, gerçek IBAN'ın doğrulandığını, Bakanlık API'sine erişim alındığını veya hukuki uygunluğun onaylandığını iddia etmez.
