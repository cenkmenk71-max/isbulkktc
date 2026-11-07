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
| Sahte profil rolü/durum değişikliği | Yalnız display_name/locale sütunlarına update grant'i; `locale` kontrolü uygulamanın gerçekten yayımladığı altı dille sınırlı (`profiles_locale_check`) | Rol/durum yazımı veritabanında izinli değil; allowlist dışı locale reddi pgTAP |
| OAuth sağlayıcı metadata'sıyla profil adı manipülasyonu | Auth trigger yalnızca doğrulanmış metadata alan adlarını seçer, kontrol karakterlerini temizler ve 80 karakterle sınırlar | Yeni kullanıcı metadata'sı için pozitif ve sınır testi pgTAP |
| İstemcide secret/service-role sızıntısı | Yalnız public Supabase publishable anahtarı örneklenir | Dağıtım öncesi secret tarama kabul kapısı |
| Kişisel dosya/izinsiz yükleme | Özel CV/ödeme kovalarında upload/download RLS politikası **yok** (varsayılan deny); kovalar `private-resumes`/`private-payment-receipts` `public=false`, yalnız `public-company-assets` `public=true` | Statik kova gizliliği kapısı (`tests/security/storage-bucket-privacy.test.ts`) + pgTAP negatif Storage testi; akış onaylanmadan açılmaz |
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

## LANE-GÜVENLİK — saldırgan denetim

Bu bölüm, `tests/security/**` katmanının düşman gözüyle denetiminin sonucudur.
Denetçi bulduğu açığı **düzeltmez**; kanıtı ve öneriyi buraya yazar, sahibi lane'e
issue açar.

### Doğrulanan güçlü kontroller (kanıtlı)

- **Yetki sınırı:** `public` şemasındaki 30 tablonun tamamı RLS ile açılıyor;
  istemciye `grant` edilen her fonksiyon `revoke ... from public, anon,
  authenticated` ile eşleşiyor; ve her tablo `anon` + `authenticated`'ten
  revoke'lu. `tests/security/sql-hardening.test.ts` bu üçünü her migration'da
  statik olarak zorlar — fonksiyon grant'ını pgTAP ratchet whitelist'i ile
  karşılaştırır (isim + argüman sayısı), tablo revoke'unu ise (virgüllü çoklu
  liste dâhil) doğrudan denetler; tablo matcher'ı `create [unlogged|temp|global
  temporary] table` biçimlerinin hepsini görür — böylece Docker beklemeden sapma
  yakalanır.
- **`SECURITY DEFINER` hijyeni:** 83 definer fonksiyonunun hepsi `set search_path
  = ''` ile sabitlenmiş ve gövdeleri tam nitelikli (`pg_catalog.*`, `public.*`)
  referans kullanıyor. Denetleyici her iki yazımı (`= ''` ve `to ''`) kabul eder
  ve boş olmayan bir yol (`set search_path = '' , public`) **reddeder** — aksi
  hâlde pin gerçekte boş olmaz.
- **Yönetici RPC'leri:** 13 `admin_*` fonksiyonunun tamamı gövdesinde
  `has_platform_role('platform_admin')` çağırıyor; bu da imzalı JWT'de `aal2`
  ister. İstemci bu fonksiyonları doğrudan çağırabilse bile yetki yükseltmesi yok.
  `tests/security/sql-hardening.test.ts` bunu **ratchet'ler**: her `admin_*`'ın
  *son* gövdesi guard'ı içermeli (yorumlar ayıklanır), ve `has_platform_role`'ün
  *kazanan* gövdesi `aal2` + aktif profil şartını korumalı — ikisi de kendi
  migration'ları yeniden oynatıldığı için yalnız son tanım geçerli.
- **Bildirim worker'ı:** Edge Function `verify_jwt = false` olmasına rağmen
  bearer'ı **yapılandırma kontrolünden önce** doğruluyor; eksik sır guard'ı
  atlamıyor (`tests/security/notification-worker-auth.test.ts`). Aynı kural iki
  Next.js cron rotası için de sabitlendi: `/api/push/dispatch` ve
  `/api/email/engagement-digest` service-role istemcisini ve yapılandırma
  kontrollerini bearer karşılaştırmasından **sonra** yapar ve sır yoksa
  fail-closed davranır (`tests/security/cron-route-auth.test.ts`).
- **Unsubscribe uç noktası:** `GET /api/email/unsubscribe` oturumsuzdur ama
  `service_role` ile yazar; yetki tamamen HMAC imzasındadır. İmza, service-role
  istemcisi kurulmadan **önce** doğrulanır; başarı gövdesi önceki opt-out
  durumuna göre dallanmaz (abonelik oracle'ı yok); çekirdek `timingSafeEqual` +
  uzunluk guard'ı kullanır (`tests/security/unsubscribe-route-auth.test.ts`).
- **Sırlar:** `NEXT_PUBLIC_*` ile sızmış bir sır adı yok; hiçbir istemci modülü
  `@/server/**` içe aktarmıyor (**statik `from`**, **dinamik `import()`** veya
  **`require()`** — üç biçim de) veya `NEXT_PUBLIC_` olmayan bir env okumuyor
  (`tests/security/client-boundary.test.ts`).
- **Turnstile (captcha) kablolaması:** captcha korumalı dört auth akışı
  (giriş, kayıt, doğrulama yeniden gönder, şifre sıfırlama) `cf-turnstile-response`
  alanını okuyup Supabase çağrısına `options: { captchaToken }` olarak geçirir;
  token isteğe bağlı olduğu için (Supabase koruma kapalıyken eksik token'ı kabul
  eder) kablolamanın sessizce kopması başka hiçbir testi kırmaz —
  `tests/security/auth-captcha-wiring.test.ts` bunu sabitler.
- **Yanıt başlıkları:** `next.config.ts` global grubu CSP (on beş direktifin
  tamamı mevcut; hiçbirinde çıplak `*` yok; çıplak `https:` yalnız uzak işveren
  görselleri yükleyen `img-src`/`media-src`'de), HSTS (`max-age` +
  `includeSubDomains` + `preload`), `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, COOP/CORP, `Permissions-Policy` (altı direktifin hepsi deny)
  gönderir; `X-Powered-By` kapalıdır; Vercel alias host'u `noindex, nofollow`
  alır. `/sw.js` için
  **`Cache-Control: no-cache, no-store, must-revalidate`** verilir: aksi hâlde
  Cloudflare edge origin'in `max-age=0`'ını 30 güne yükseltiyor ve yeni bir
  service worker (`CACHE_VERSION` artışı) PWA kullanıcısına günlerce ulaşmıyor
  (edge audit tur-14, SW-01). `tests/security/security-headers.test.ts`
  **gerçek config'i import edip** `headers()`'ı çağırarak bunları doğrular.
- **HTML önbelleği paylaşımlı katmanda kapalı (P-01, #390):** prerender rotalar
  (`/blog`, `/contact`, `/freelance`, `/about`, `/privacy`, `/terms` ve bunların
  yerel-önekli eşleri) Next'in ISR varsayılanıyla **`Cache-Control: s-maxage=<n>,
  stale-while-revalidate=<n>`** — yani *paylaşımlı* önbellek direktifi — dönerken
  aynı yanıtta yerel middleware'in **`Set-Cookie: NEXT_LOCALE=…`** başlığı da
  bulunuyor. `Vary` `Cookie`'yi hiçbir zaman listelemiyor ve Next config'ten
  yazılan bir `Vary`'ı **kendi değeriyle eziyor** (standalone sunucuda
  doğrulandı: `Vary: Cookie` kuralı düşürülüyor), dolayısıyla önbellek anahtarı
  bu dosyadan düzeltilemez. Tek çare HTML'i paylaşımlı katmanda hiç
  önbelleklememek: `next.config.ts` `headers()`'a `Cache-Control: private,
  no-cache, no-store, max-age=0, must-revalidate` kuralı eklendi. Kuralın
  matcher'ı **middleware'in kendi matcher'ıyla birebir aynı**
  (`/((?!api|trpc|_next|_vercel|.*\\..*).*)`), yani tam olarak çerezi alan
  rotaları kapsar; uzantılı yollar, `_next/**`, `/api/**`, `/trpc`, `/vercel`
  dışarıda kalır → `immutable` varlık önbelleği ve `/sw.js` no-cache kuralı
  bozulmaz. `tests/security/security-headers.test.ts` kuralı **Next'in kendi
  `buildCustomRoute` derleyicisiyle** sınayıp matcher'ı middleware'e
  sabitliyor (ratchet). Kanıt: standalone sunucuda `/de/blog` hâlâ
  `x-nextjs-prerender: 1` (iç önbellek HIT) ama artık `private, no-cache,
  no-store` döner; `/robots.txt` (`public, max-age=0`), `/sitemap.xml`,
  `/llms.txt` (`public, max-age=3600`) ve `/images/*` değişmemiştir. İç ISR
  önbelleği korunur, yalnız paylaşımlı katman (CDN/proxy) devre dışı kalır.
- **Görsel optimizasyon allowlist'i:** `images.remotePatterns` sunucu tarafında
  `/ _next/image`'ın hangi host'lardan görsel çekebileceğini belirler; her desen
  **tam bir https host + https protokol** olmalı, private/loopback/metadata host
  yasak. `images.localPatterns` ise aynı-origin **yerel** yolları sınırlar: onsuz
  `?url=%2Fblog` gibi göreli bir yol o rotanın içeriğini (HTML/JSON/text)
  döndürüyordu (edge audit tur-11, #324). Desenler yalnız `/images/**` ve
  `/logos/**`'a izin verir **ve bir görsel uzantısı şart koşar**
  (`*.@(webp|png|jpg|jpeg|avif|svg)`); böylece matcher'ın kodlanmış hâliyle
  eşleşip fetch'in bir kez daha çözerek başka rotaya gittiği çift-kodlama
  atlatması (`/images/%252e%252e/blog`, #356) kapalıdır. Her başka yol ve sorgu
  dizeli görsel yolu `400 INVALID_IMAGE_OPTIMIZE_REQUEST` alır. Aynı test dosyası
  bunları **gerçek config'ten** ve Next'in kendi matcher'ıyla denetler.
- **Açık yönlendirme kapalı:** `sanitizeNextPath` normalizasyon sonrası çıktıyı
  yeniden doğruluyor (`//`, `\`, şema reddi). Denetimde bulunan `"/..//host"`
  bypass'ı sahibi tarafından kapatıldı; `tests/security/open-redirect.test.ts`
  artık iki `todo` yerine iki gerçek kapı çalıştırıyor.
- **Hız sınırı (form):** `submitFeedback` ve `submitSalesLead` RPC'den ve
  tetikledikleri e-postadan **önce** istemci adresi ve gönderilen adres başına
  sabit-pencere hız sınırı uygular (`src/features/abuse/**`). Böylece form
  üzerinden istenmeyen e-posta ve gelen kutusu boğma vektörü kapandı.
  `tests/security/anonymous-rpc-throttle.test.ts` bunu **sıra** olarak zorlar
  (throttle `RateLimiter.check(` çağrısı RPC'den ve mail fan-out'undan **önce**
  gelmeli), yalnız varlık olarak değil.
- **Oturum doğrulaması:** proxy oturumu `auth.getClaims()` ile **imza doğrulayarak**
  okur (ham `getSession()` değil), böylece çerez sahtelenerek başka kullanıcı
  render edilemez. Tarayıcıda `createBrowserClient` yok; uygulama Supabase'e
  yalnız sunucudan konuşur (`tests/security/session-cookie-flags.test.ts`).
  Oturum çerezi `HttpOnly` + `Secure` (üretimde) + `SameSite=Lax|Strict`'tir; aynı
  bayraklar OAuth sign-up intent çerezinde de pinlidir. `SameSite=none` (CSRF
  savunmasını kaldırır) testi kırmızı yapar.
- **Auth callback yönlendirmesi:** `/auth/callback` public GET olduğundan
  query değerleri güvenilmez. `auth-routing.ts` yalnız kapalı kelime dağarcığını
  yola çevirir: `next` (`"company"` dışındaki her değer aday), `flow`
  (`email|oauth|reset`), `sb_flow_id` (yalnız 32-küçük-hex). Her hedef/hata yolu
  locale-prefix'li literal; `?error=` tek başına yönlendirme üretmez.
  `tests/security/auth-redirect-boundary.test.ts` bunu sabitler (bulgu yok).
- **CI tedarik zinciri:** `pull_request` ile koşan her workflow top-level
  `permissions:` bildirir ve en az yetkidedir; **her** `permissions:` bloğu
  (top-level ve job-level) denetlenir — job-level bir blok top-level'ı geçersiz
  kıldığı için yalnız üstteki bloğa bakmak `contents: write`'ı kaçırırdı. Hiçbiri
  `pull_request_target` kullanmaz. Tek `write` sahibi `agent-pr-automation.yml`'dir
  (yalnız `gh pr merge/edit`; PR kodunu checkout etmez), ve auto-merge kapısı
  `.github/workflows/**` değişikliğini yine reddeder.
  `tests/security/ci-workflow-permissions.test.ts`.

### Açık bulgular (sahibine bildirildi, düzeltme bekliyor)

1. **DB throttle'ın IP boyutu app yolunda tek kovaya düşüyor** (sahibi:
   `src/features/**` -> LANE-URUN, `supabase/**` -> LANE-SUPABASE).
   LANE-SUPABASE `20261106000000_v4_anon_write_throttle.sql` ile throttle'ı RPC
   gövdesine taşıdı: `submit_feedback` ve `submit_sales_lead` artık insert'ten
   önce `public.consume_anon_write_quota(...)` çağırıyor ve ledger + helper
   client rollerinden revoke'lu — yani **doğrudan PostgREST saldırganı artık
   sınırlı** (eski #139 bulgusunun saldırı yarısı kapandı; kapıya terfi etti,
   `tests/security/anonymous-rpc-throttle.test.ts`).
   Kalan sorun IP boyutunda: migration IP'yi `current_setting('request.headers')`
   (`cf-connecting-ip` / `x-real-ip` / `x-forwarded-for`) üzerinden okuyor, bunlar
   **PostgREST isteğinin** başlıkları. Doğrudan çağıran bir saldırgan bunları
   taşır; ama uygulamanın Next.js server action'ı supabase-js ile çağırıyor ve
   supabase-js ziyaretçi IP'sini **göndermiyor** (kurulu `@supabase/supabase-js`
   ile ölçüldü: yalnız `apikey`, `authorization`, `content-type`,
   `x-client-info`). Sonuç: app üzerinden gelen **tüm** gönderimler tek paylaşılan
   kovaya düşer; migration'ın "eksik başlık tek kovaya düşer" notu app için
   *normal* durumdur, kenar durum değil. Pencerede site geneli altıncı meşru
   gönderim generic "failed" ile reddedilir. Önerilen düzeltme: action, ziyaretçi
   adresini (`clientIp()`) RPC'ye açık bir argümanla geçirsin (ya da supabase-js
   `global.headers` ile `cf-connecting-ip` eklesin), RPC de o argümanı başlığa
   tercih etsin. Kanıt: `tests/security/anonymous-rpc-throttle.test.ts` (`todo`).
   Devir: **#206** (`agent:handoff`, LANE-URUN + LANE-SUPABASE).
2. **`server-only` sınırı eksik** (sahibi: `src/server/email/**`, LANE-URUN).
   `src/server/email/unsubscribe-token-core.ts` `ENGAGEMENT_UNSUBSCRIBE_SECRET`
   ve `RESEND_API_KEY` okuyor ama `import "server-only"` taşımıyor. `src/server`
   altındaki diğer tüm sır-okuyan modüller bu işareti taşıyor; eksik olan, yanlış
   bir istemci içe aktarımını derleme hatası yerine sessiz bir sızıntıya çevirir.
   Kanıt: `tests/security/client-boundary.test.ts` (`todo`).
3. **İki `service_role`-only RPC'de gövde-içi rol guard'ı yok** (sahibi:
   `supabase/**`, LANE-SUPABASE; devir **#298**). `list_engagement_recipients` ve
   `opt_out_engagement` `service_role`'e grant'li ama gövdelerinde
   `auth.role() <> 'service_role'` kontrolü yok; diğer altı `service_role`-only RPC
   (push + outbox) bunu yapıyor. Birincil kontrol (`revoke … from public, anon,
   authenticated`) yerinde ve pgTAP'te sabit, ama bir gün `anon`/`authenticated`'e
   EXECUTE yanlışlıkla geri verilirse (bu depoda oldu) bu ikisinin ikinci savunma
   hattı yok — `list_engagement_recipients` tam bir mailing-list dump'ıdır. Kanıt:
   `tests/security/sql-hardening.test.ts` → "every service-role-only RPC re-checks
   auth.role() in its own body" (`todo`).
4. **`NEXT_LOCALE` çerezi `Secure` bayrağını taşımıyor** (sahibi:
   `src/i18n/routing.ts`, LANE-İÇERİK). Yerel middleware her belge gezinmesinde
   `Set-Cookie: NEXT_LOCALE=de; Path=/; SameSite=lax` yazıyor — `Secure` yok.
   `HttpOnly` **eklenemez**: dil değiştirici bu çerezi istemciden yazıyor
   (`src/components/layout/site-header.tsx` `<Link … locale={code}>` → next-intl
   `syncLocaleCookie` → `document.cookie`), ve `document.cookie` `HttpOnly`
   bayrağını **atayamaz** — yani sunucu tarafında tek satırlık bir ekleme değil,
   önce istemci yazım yolunun değişmesi gerekir.
   `Secure` için böyle bir çelişki yok. Üretim HTTPS-only (HSTS
   `includeSubDomains; preload`) olduğu için değer bugün telde açıkta değil; ama
   bir HTTP downgrade'i ya da mixed-content gömme aynı değeri düz metin gönderir.
   Uygulamanın yazdığı diğer tüm çerezler (oturum, OAuth-intent, consent) üretimde
   `Secure` taşıyor, yani bu çerez tutarsız. Kanıt:
   `tests/security/locale-cookie-flags.test.ts` (`todo`; gerçek middleware, gerçek
   `routing.ts` ile sürülür).
5. **Kimlik uç noktalarında uygulama-içi hız sınırı yok** (sahibi:
   `src/features/identity/**` -> LANE-AUTH). `signIn` (`actions.ts:111`) ve
   `requestPasswordReset` (`actions.ts:302`) doğrudan
   `signInWithPassword` / `resetPasswordForEmail` çağırıyor; `src/features/abuse/**`
   limiter'ı yalnız feedback/sales action'larında bağlı, bu ikisinde **hiç yok**.
   Platform captcha'sı da bir yedek değil: **hosted projede Supabase captcha
   KAPALI** — `POST /auth/v1/token?grant_type=password` bogus bir
   `gotrue_meta_security.captcha_token` ile bile `invalid_credentials` döndü
   (`captcha_failed` değil), `/auth/v1/settings` gövdesinde captcha anahtarı yok.
   (Yerel `supabase/config.toml:63-66` "hosted projede captcha açık" diyor; bu
   yorum bayat.) Yayınlanabilir anahtar yeterli: saldırgan `/auth/v1/token` ile
   sınırsız şifre denemesi, `/auth/v1/recover` ile sınırsız sıfırlama maili
   gönderebilir; action üstüne hiçbir sınır koymuyor. #418 §7'nin "giriş
   denemesi / şifre sıfırlama talebi rate limit" maddesi karşılanmamış.
   Önerilen düzeltme: `src/features/abuse/**` limiter'ını (veya DB-tarafı bir
   kotayı) `signIn` ve `requestPasswordReset`'e bağla; kullanıcıya nötr bir
   "çok deneme" mesajı döndür. Kanıt:
   `tests/security/auth-throttle-surface.test.ts` (`todo`, mutasyonla
   doğrulandı). Devir: **#457** (`agent:handoff`, LANE-AUTH).

### Kapatılan bulgular (sahibi düzeltti, kapıya terfi etti)

- **Push endpoint'i üzerinden SSRF** (sahibi: LANE-URUN + LANE-SUPABASE; #273,
  devir #262). Kayıtlı bir ziyaretçi `endpoint`'e herhangi bir `https://` URL
  yazabiliyordu; cron worker (`/api/push/dispatch` -> `sendPushMessage` ->
  `web-push`) o URL'ye **sunucudan** bağlanıyordu — host allowlist'i yoktu (kör
  SSRF; `https://127.0.0.1/...` yerel bir dinleyiciye 1 bağlantı / 1568 bayt TLS
  ClientHello yaptı). Düzeltme: `isAllowedPushEndpoint`
  (`src/server/push/push-endpoint.ts`) yalnız bilinen push servis host'larını
  kabul eder; IP literal, decimal-IP, `localhost`, `.local`/`.internal` reddedilir.
  **Her iki yazma yolu** (route + `savePushSubscription`) ve gönderim ucu onu
  çağırır. `tests/security/push-endpoint-ssrf.test.ts` artık bir **kapı**; aynı
  test kayıt rotasının (`/api/push/subscriptions`) gövdeyi ayrıştırmadan **önce**
  oturum istediğini (`getUser()` → 401) de sabitler — bu kapı sessizce kaldırılsa
  anonim bir çağıran push kimlik bilgisi kaydedebilirdi.

- **Açık yönlendirme — `sanitizeNextPath` normalizasyon bypass'ı** (sahibi:
  `src/lib/pwa/destination.ts`, LANE-URUN). `/[locale]/install?next=` girdisi,
  WHATWG URL çözümlemesi `..`/`.` segmentlerini **önce** işlediği için, ikinci
  slash'ı bir nokta segmentinin arkasına saklayan bir yol protokol-göreli URL'ye
  dönüşüyordu: `sanitizeNextPath("/..//evil.example") -> "//evil.example"` ve
  `new URL("//evil.example", "https://isbulkktc.com/install").origin ===
  "https://evil.example"`. Posterden taranan QR, "Uygulamaya devam et"
  bağlantısını başka bir host'a yönlendirebiliyordu (markalı poster üzerinden
  phishing). Düzeltme normalize edilen çıktıyı yeniden doğruluyor;
  `tests/security/open-redirect.test.ts` iki testi artık `todo` değil, kapı.
- **Anonim formlarda istismar kontrolü yok** (sahibi: `src/features/feedback/**`,
  `src/features/sales/**`, LANE-URUN). Ne captcha ne hız sınırı vardı. Şimdi
  `src/features/abuse/**` action'da adres/IP başına throttle uyguluyor;
  `tests/security/anonymous-write-surface.test.ts`'teki test `todo`'dan kapıya
  terfi etti. (Endpoint'in kendisi hâlâ açık — yukarıdaki 1. bulgu.)
- **Anon write RPC'leri doğrudan çağrılabiliyordu (#139)** (sahibi:
  `supabase/**`, LANE-SUPABASE). `submit_feedback` / `submit_sales_lead`
  `anon`'a grant'li ve `security definer`; abuse kontrolü yalnız action'daydı,
  yani `POST /rest/v1/rpc/submit_feedback` ile atlanıyordu. LANE-SUPABASE
  `20261106000000_v4_anon_write_throttle.sql` ile throttle'ı RPC gövdesine
  taşıdı (insert'ten önce `consume_anon_write_quota`, ledger + helper client
  rollerinden revoke'lu). `tests/security/anonymous-rpc-throttle.test.ts` artık
  gevşek bir `/throttle/i` araması yerine her RPC'nin gövdesinde çağrının
  varlığını ve insert'ten önce çalıştığını doğrulayan bir **kapı** çalıştırıyor.
  (IP boyutunun app yolundaki kalan açığı yukarıdaki 1. bulgudur.)
- **Oturum çerezi sertleştirilmemişti** (sahibi: LANE-AUTH; devir #167). Oturum
  çerezi `@supabase/ssr` varsayılanlarıyla yazılıyordu (`httpOnly: false`,
  `Secure` yok). LANE-AUTH (#201) iki çağrı noktasına da
  `cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production" }`
  ekledi; `tests/security/session-cookie-flags.test.ts` `todo`'dan kapıya terfi etti.

### Katmanın kendi dedektörleri (4. tur sertleştirmesi)

Denetçi katmanının gücü kendi regex'leri kadardır; bu turda üç yanlış-negatif
kapatıldı ve her biri bir self-test ile sabitlendi:

- `client-boundary.test.ts` env dedektörü artık `process.env.NAME`,
  `process.env["NAME"]`, `process.env?.NAME`, `process['env'].NAME` ve
  `const { NAME } = process.env` biçimlerinin hepsini görüyor (eskiden yalnız
  nokta erişimi).
- `sql-hardening.test.ts` `create table` matcher'ı rakam-sonekli ve tırnaklı
  tablo adlarını tam yakalıyor; `security definer` matcher'ı `$fn$` gibi
  etiketli gövdeleri de tarıyor; grant matcher'ı `grant all on function` ve
  `grant … to public` biçimlerini de yakalıyor.

### Katmanın CI'a bağlanması

`tests/security/**` artık `bun run test:security` ile `static` CI işinde kendi
adımı olarak koşuyor (`package.json` + `.github/workflows/ci.yml` = LANE-INFRA).
Bu kapatıldı; katman yerelde `bun run test:security` ile yeşildir.

### Katmanın kendi dedektörleri (29. tur — CI izinleri + service-role grant)

Bu turda dış yüzey yerine yine **dedektörlerin kendisi** düşman gözüyle tarandı;
iki gerçek yanlış-negatif bulundu, kanıtlandı ve düzeltildi.

- **`ci-workflow-permissions.test.ts` `permissions:` tarayıcısı yalnız blok
  biçimini görüyordu.** `permissionsBlocks` regex'i `permissions:`'tan sonra
  satır sonu + girintili satır şart koşuyordu; bu yüzden job düzeyinde
  `permissions: { contents: write }` (flow-map) ve `permissions: write-all`
  (bare scalar) biçimleri **görünmüyordu**. Kanıt: iki biçim de `[]` döndürdü.
  Yani bir workflow job'una flow-map/scalar ile yazma jetonu verip testi yeşil
  bırakabilirdi — tedarik-zinciri sınırı delikti. `permissionsSpecs` artık her
  üç biçimi, her girintide okuyor; `topLevelPermissions` üst-düzey flow-map'i
  de "bildirilmiş" sayıyor. (Mutation: `ci.yml` `static` job'una
  `permissions: { contents: write }` → kırmızı, geri alınca yeşil.)
- **`sql-hardening.test.ts` `serviceRoleOnlySignatures` yalnız `grant execute`
  görüyordu.** Kardeşi `grantedToClients` `grant (execute|all)`'a genişletilmişti
  ama bu fonksiyon `grant all on function … to service_role` biçimini
  kaçırıyordu; öyle verilmiş bir worker RPC `service_role`-only kümesine hiç
  girmiyor, dolayısıyla gövdesindeki `auth.role()` guard'ı **denetlenmiyordu** —
  bu suite'in önlemek için var olduğu tam yanlış-negatif. İki tarayıcı artık aynı
  biçimi okuyor; `public` rolü de client-grant sayılıp "service-role-only"
  dışında bırakılıyor. (Mutation: `grant all … to service_role` yazan scratch
  definer + guardsız gövde → test kırmızı, eski tarayıcıda yeşil kalırdı.)

Her ikisi için self-test eklendi (blok/flow-map/scalar; `grant all`/`grant
execute`/`to public`), böylece tarayıcı bir daha daraltılırsa CI kırmızı olur.
Bu tur **hiçbir dış sınırı değiştirmedi** — mevcut kontroller zaten doğruydu;
kapatılan şey onları koruyan guard'ın körlüğüydü.

### Katmanın kendi dedektörleri (30. tur — `on:` tetikleyici, paren'siz grant, script-src pin)

Aynı sınıf (dar matcher) için kalan dedektörler tarandı; **üç** yanlış-negatif
bulundu, kanıtlandı ve düzeltildi. Üçü de guard'ın körlüğüydü, dış sınır
değişmedi.

- **`ci-workflow-permissions.test.ts` `on:` tetikleyicisini yalnız blok
  biçiminde okuyordu.** İki ayrı regex vardı: `/^\s{0,4}pull_request:\s*$/m`
  (`onPullRequest` için) ve `/^\s{0,4}pull_request_target:\s*$/m` (`pull_request_target`
  kapısı için). GitHub `on:`'u dizi (`on: [push, pull_request]`) ve flow-map
  (`on: { pull_request: {} }`) biçimlerinde de kabul eder; ikisi de **hiç
  görünmüyordu**. Kanıt: dört biçim denendi, yalnız blok biçimi `true` döndü.
  Etki: `on: [pull_request_target]` yazan bir workflow (base repo jetonu + sırları
  ile, üstelik güvenilmeyen PR head'i checkout ederek) `pull_request_target`
  kapısından **geçerdi**; `on: { pull_request: {} }` yazan bir workflow ise
  "top-level permissions bildirmeli" kapısından muaf kalırdı. YAML parser
  bağımlılığı yok, bu yüzden `triggerEvents` adında küçük bir girinti tarayıcısı
  eklendi: blok, dizi, flow-map ve blok-içi dizi biçimlerinin hepsini, ayrıca
  `#` yorumunu atlayarak okur. Her iki event adı için self-test eklendi.
  (Mutation: `on: { pull_request_target: {} }` yazan scratch workflow → kapı
  kırmızı, eski regex'te yeşil kalırdı.)
- **`sql-hardening.test.ts` grant/revoke tarayıcıları paren'siz sıfır-argüman
  biçimini kaçırıyordu.** `grant execute on function public.f(text) to anon;`
  görülüyordu ama Postgres'in kabul ettiği `grant execute on function public.f
  to anon;` (sıfır argümanlı fonksiyon, argüman listesi atlanmış) **hiçbir** üç
  tarayıcıda (`serviceRoleOnlySignatures`, `grantedToClients`,
  `revokedFromClients`) eşleşmiyordu — çünkü hepsi `\(([^)]*)\)` şart koşuyordu.
  Etki: paren'siz yazılmış bir `grant … to anon` "client grant" sayılmaz, onu
  eşleştiren bir `revoke` aranmaz; yani bir fonksiyon revoke'suz istemciye
  açılıp "her client grant bir revoke ile eşleşmeli" kapısını **yeşil
  bırakabilirdi**. Argüman listesi artık isteğe bağlı (`(?:\(([^)]*)\))?`) ve
  yokluğunda `()` (sıfır argüman) sayılıyor. İki self-test eklendi.
  (Mutation: paren'siz `grant execute … to anon` yazan scratch migration →
  "client-callable functions granted without a matching revoke" kırmızı; eski
  regex satırda **0** eşleşme veriyordu.)
- **`security-headers.test.ts` `script-src` yalnız çıplak joker/yasaklı token
  arıyordu.** İki assertion `*` ve çıplak `https:`'i reddediyordu ama **yeni bir
  açık host** eklemeyi hiç görmüyordu. Kanıt: `script-src … https://evil.example`
  eklenince üç assertion da geçti (`true`). Etki: hangi origin'in script
  çalıştırabileceğini belirleyen tek direktif, tek satırlık bir düzenlemeyle
  genişletilip suite yeşil bırakılabilirdi — XSS sınırı sessizce açılırdı.
  `script-src` kaynak listesi artık birebir sabitleniyor (pin); header ancak bu
  listeyi değiştirerek değişebilir. (Mutation: `next.config.ts` `script-src`'ye
  `https://evil.example` → pin kırmızı; eski assertion'larda yeşil kalırdı.)

Ders: bir guard'ın regex'i ne kadar dar olursa koruduğu sınır o kadar deliktir;
her yeni biçim (YAML flow/dizi, SQL paren'siz imza, CSP açık host) için önce
self-test yaz — ve bir "yasakla" kontrolünü "sabitle" kontrolüyle eşleştir;
yasak liste yalnız bildiği kötü biçimi görür, sabit liste bilinmeyeni de durdurur.

### Katmanın kendi dedektörleri (31. tur — sabit liste yerine keşif)

Aynı sınıf (guard'ın körlüğü) bir kez daha tarandı, bu kez **konu keşfi** (subject
discovery) boyutunda: bir dedektör neyi denetleyeceğini **sabit bir listeden**
alıyorsa, o listeye girmeyen yeni bir dosya/rota/fonksiyon sınırın dışında kalır
ve guard yeşil kalır. **Altı** dedektör bu yüzden yanlış-negatif veriyordu; altısı
da kendi konusunu tarayarak keşfedecek şekilde düzeltildi.

- **`cron-route-auth.test.ts` iki rotayı literal diziden okuyordu.** Yeni bir
  `src/app/api/**/route.ts` (üçüncü bir cron worker'ı ya da kopyalanmış bir rota)
  bearer deseniyle eşleşse bile **hiç taranmıyordu**; bu suite'in var oluş sebebi
  olan "config okuması auth'tan önce" hatası yeni rotada yeşil geçerdi. Kanıt:
  `createSupabaseServiceClient()`'ı `Authorization` kontrolünden **önce** çağıran
  bir `src/app/api/probe-cron/route.ts` eklenince eski hali 0 kırmızı verdi.
  Rotalar artık `src/app/api/**` ağacından bearer-imzası (`authorization` başlığı +
  `Bearer ${…}` + `*_SECRET|*_TOKEN` env) ile keşfediliyor; self-test hem imzayı
  hem near-miss'leri (`NEXT_PUBLIC_TOKEN`, yalnız-secret, yalnız-header) sınıyor.
  (Mutation: probe-cron → "authenticates before it inspects its configuration"
  kırmızı; eski listede yeşil kalırdı.)
- **`session-cookie-flags.test.ts` iki çağrı noktasını literal diziden okuyordu.**
  Üçüncü bir `createServerClient(...)` çağrısı (yeni proxy, rota yardımcısı) hiç
  denetlenmezdi; `httpOnly:false`/`Secure` yok varsayılanlarıyla yazılan bir oturum
  çerezi yeşil geçerdi. Kanıt: `src/server/db/probe-client.ts` (flagsiz çağrı)
  eklenince eski hali 0 kırmızı verdi. Çağrı noktaları artık `src/**` içinden
  `createServerClient(?:<…>)?(` deseniyle keşfediliyor. (Mutation: probe-client →
  "session cookies without HttpOnly/Secure/SameSite" kırmızı.)
- **`notification-worker-auth.test.ts` tek worker'ı yol ile sabitliyordu.** İkinci
  bir `verify_jwt = false` edge fonksiyonu (yeni webhook alıcısı) config'te
  açılsa bile, kimlik doğruladığını iddia eden **hiçbir test** koşmazdı. Kanıt:
  config'e `[functions.probe-webhook] verify_jwt = false` + sırası bozuk bir
  `index.ts` eklenince eski hali 0 kırmızı verdi. Fonksiyonlar artık
  `supabase/config.toml`'dan `verify_jwt = false` tabloları taranarak keşfediliyor;
  self-test hem bildirimi hem `verify_jwt = true` near-miss'ini sınıyor.
  (Mutation: probe-webhook → "authenticates before it inspects its configuration"
  kırmızı.)
- **`anonymous-rpc-throttle.test.ts` throttle kapısını iki RPC adıyla
  döndürüyordu.** Üçüncü bir `anon`'a grant'li yazma RPC'si (yeni iletişim formu,
  `submit_feedback` kopyası) PostgREST'ten çağrılabilir olur ama gövdesinde
  throttle olup olmadığı **denetlenmezdi**. Kanıt: throttle'sız
  `submit_probe_lead` migration'ı eklenince eski hali bu kapıyı yeşil bıraktı.
  Yazma RPC'leri artık grant taramalarından keşfediliyor, gövdesi
  `insert/update/delete` içerenler seçiliyor; self-test iki bilinen yazarı bulup
  salt-okur `search_public_*`'ı dışladığını kanıtlıyor. (Mutation: probe migration →
  hem "discovered set drifted" hem "inserts without a per-caller throttle" kırmızı.)
- **`auth-captcha-wiring.test.ts` tek dosyayı ve yalnız ilk çağrıyı okuyordu.**
  Token ileri-aktarımı yalnız `src/features/identity/actions.ts` içinde ve
  `authCallBlock` yalnız **ilk** `supabase.auth.<call>(` bloğunu döndürüyordu. İki
  yanlış-negatif: (a) yeni bir identity dosyasındaki captcha-korumalı çağrı hiç
  taranmazdı; (b) aynı dosyada ikinci bir `signUp` token'ı düşürse ilk çağrı
  sayesinde yeşil kalırdı. Kanıt: token'sız `src/features/identity/probe-second-form.ts`
  eski halde yeşil kalırdı. Dosyalar `src/features/identity/**`'tan keşfediliyor;
  `authCallBlocks` **tüm** çağrıları döndürüyor; self-test iki-çağrı near-miss'ini
  sınıyor. (Mutation: probe-second-form → "does not pass captchaToken" kırmızı.)
- **`anonymous-write-surface.test.ts` guard dosyalarını iki adla listeliyordu.**
  `submit_feedback`/`submit_sales_lead`'i çağıran **üçüncü** bir action (yeni
  iletişim formu) captcha/throttle taşımasa bile denetlenmezdi. Kanıt: guard'sız
  `src/features/feedback/probe-third-form.ts` eski halde yeşil kalırdı. Formlar
  artık `src/features/**` içinde RPC çağrısıyla keşfediliyor. (Mutation:
  probe-third-form → "has neither captcha nor rate limiting" kırmızı.)

Ortak ders: **bir guard konusunu listelemek yerine taramalı.** Sabit liste bugünü
korur, yarını değil; her yeni dosya/rota/fonksiyon sessizce kapsam dışı kalır.
Keşif predicate'i de bir guard'dır — bu yüzden her biri için self-test (hem
pozitif hem near-miss) eklendi.

### #424 — API yanıt yüzeyi: platform davranışı ve kendi kapımız (32. tur)

LANE-CLOUDFLARE tur 25'in canlı ölçümüyle açtığı **#424** devralındı (devir, engel
değil). Dört bulgu da **yeniden üretildi**; üçü origin'in değil **Vercel
platformunun** davranışı çıktı. Ayırt edici ölçüm: aynı istek yerel üretim
standalone sunucusunda (`node server.js`, platform katmanı yok) **hiç** o başlığı
döndürmüyor. Kapsam notu M-01'in gerçek sahibinin "büyük olasılıkla Vercel"
olduğunu söylüyordu; ölçüm bunu **kanıta** çevirdi.

| # | Gözlenen (canlı) | Yerel standalone | Kaynak | Sınıf |
|---|---|---|---|---|
| M-01 | `/api/build-info` → `access-control-allow-origin: *` | **ACAO yok** | `dynamic = "force-static"` → Vercel statik katmanı | platform |
| M-02 | `PUT`/`DELETE`/`PATCH /`, `/jobs` → 200 | 200 (framework) | Next.js sayfa yönlendirmesi | framework |
| M-03 | API hata yolları → `public, max-age=0, must-revalidate` | **CC yok** | Vercel dinamik fn varsayılanı | platform |
| M-04 | `/_next/static/<yok>` 404 → `max-age=31536000` | `private, no-cache, no-store` | Vercel statik katmanı | platform |

- **M-01 (düşük, kabul).** `access-control-allow-origin: *` depoda **hiç** yok
  (`grep -r access-control-allow-origin src/ next.config.ts` → 0); aynı başlık
  `/robots.txt`, `/sitemap.xml`, `/_next/static/*.css`'te de var, HTML sayfalarında
  ve `force-dynamic` rotalarda **yok** — yani Vercel prerender/statik yanıtlara
  ekliyor. Gövde `{"commit":"<40hex>","environment":"production"}`. **Etki düşük:**
  depo **public**, commit SHA zaten kamuya açık; sömürülebilir gizli veri yok.
  Gerçek risk payload'ın büyümesi: `{ ...process.env }` gibi bir gerileme, bir
  sürüm parmak izini her origin'den okunabilir bir sır sızıntısına çevirir.
  **Kapı:** `tests/security/api-response-surface.test.ts` — gövde **birebir**
  `{commit, environment}` (fazladan anahtar kırmızı), `commit` `unknown|hex`,
  `environment` kısa token, rota kendi `no-store`'unu korur.
- **M-02 (düşük, devir).** Sayfa rotaları yazma yöntemlerine 200 dönüyor
  (framework dokümanı sunar). **Dikkat:** "sayfa rotalarında non-GET'i reddet"
  şeklindeki bariz düzeltme **Server Actions**'ı kırar — action'lar bir sayfa
  yoluna `Next-Action` başlığıyla **POST** eder (ölçüldü: `POST /de/blog`
  `Next-Action` ile → 400, başlıksız → 200). Cache zehirlenmesi zaten #390 kuralı
  (`private, no-cache, no-store`) ile kapalı: `PUT /de/blog` bu başlığı döndürüyor.
  Düzeltme kararı `src/proxy.ts` sahibinde; sahibi **yok** (aşağıda).
- **M-03/M-04 (düşük, platform).** `max-age=0, must-revalidate` her istekte
  yeniden doğrular; statik 404'ler içerik-adresli hash'lerle sunulur, `must-revalidate`
  ile bayat-404 riski yok. CF bugün bu yolları cache'lemiyor. Depo-tarafı düzeltme
  yok; bir CF Cache Rule eklenirse N-01 sınıfı risk yeniden doğar (LANE-CLOUDFLARE
  izliyor).
- **Yapısal boşluk (devir: LANE-INFRA).** `src/proxy.ts` (oturum/çerez/locale
  güvenlik sınırı) ve `src/app/api/build-info/**` **hiçbir** lane'in sahiplik
  tablosunda yok. Sahipsiz güvenlik-kritik yüzey = kimsenin düzeltmediği yüzey.
  Sahiplik tablosunun sahibi LANE-INFRA.

**Kapı (bu tur).** `tests/security/api-response-surface.test.ts` (yeni, 7 test):
build-info yalnız sürüm kimliği + `no-store`; depoda/konfigde **hiç** ACAO yok
(M-01 platform-only kaldığı sürece); her `src/app/api/**/route.ts` `dynamic`
bildirir; her `force-static` rota `no-store` taşır. Üç self-test guard'ın
görmediği biçimi göstermesi için (mutasyonla kanıtlandı).

### Katmanın kendi dedektörleri (33. tur — HTTP başlık adı büyük/küçük harf körlüğü)

31. turda dedektörler **konu keşfi**ne geçti; bu turda aynı sınıfın bir alt
biçimi bulundu: keşif predicate'i konunun **yazımına** dar. İki bearer-guard
dedektörü `Authorization` başlığını **küçük harfli** literalle arıyordu.

- **Bulgu + düzeltme: `cron-route-auth.test.ts` başlık adına duyarlıydı.**
  `isBearerSecretGuard` içindeki `/headers\.get\(\s*["']authorization["']/`
  yalnız küçük harfli `.get("authorization")` biçimini görüyordu. HTTP başlık
  adları **büyük/küçük harf duyarsızdır** ve `"Authorization"` kanonik yazımdır;
  bu yüzden `headers.get("Authorization")` yazan bir cron rotası **keşfedilmiyor**,
  dolayısıyla sıralama / fail-closed / yansıma kontrollerinin **hiçbiri** onun
  için koşmuyordu. Ölçüm: 8 gerçekçi biçimin **7'si** kaçırıldı (kanonik
  `"Authorization"` dâhil): `"AUTHORIZATION"`, `headers["authorization"]`,
  `"Bearer " + s` birleştirmesi, `process.env` yıkımı, `process.env["…"]`,
  `new Headers()` kopyası. `authorizationLookup` artık `.get(...)` ve bracket
  biçimini, her harf durumunda (`/i`) görüyor.
- **Düzeltme paylaşılan kaynağa çıkarıldı: `tests/security/authorization-header.ts`.**
  Aynı körlük `notification-worker-auth.test.ts`'te de vardı (orada semptom
  gürültülü: `authIndex > -1` iddiası kırmızı olur, ama sıralama yine
  denetlenmez). İki tarayıcı `sql-hardening` kardeşlerinde bir kez sürüklendiği
  için matcher tek bir modülden okunuyor; sürüklenme imkânsız.
- **Kanıt (mutation).** `createSupabaseServiceClient()`'ı `headers.get("Authorization")`
  kontrolünden **önce** çağıran bir `src/app/api/probe-cron-case/route.ts`
  eklendi: **eski** dedektör onu keşfetmedi (0 kırmızı, sessiz yeşil), **yeni**
  dedektör keşfedip "authenticates before it inspects its configuration"
  testini kırmızıya çevirdi. Probe temizlendi; iki suite 15/15 yeşil.
- **Bilinçli sınır (sessiz değil).** Başlık maddesi bir `headers` alıcısına
  bağlı; başlık haritasını farklı adlı bir değişkene kopyalayan bir rota
  (`const h = new Headers(request.headers); h.get(…)`) keşfedilmez. Bugün böyle
  bir rota yok; çıkarsa bağ genişletilir.

### Katmanın kendi dedektörleri (34. tur — log güvenliği: #418 §7 kapısız madde)

#418 §7'nin **"Log: şifre/token loglanmıyor"** maddesi, hesap güvenliği
kapsamındaki tek kapısız maddeydi: çerez bayrakları, auth sıralaması ve yanıt
yüzeyi kapılıydı, ama bir `console.error("giriş başarısız", { password })` —
kimliğin bir log toplayıcısına düşmesinin en yaygın yolu — her kapı yeşilken
gönderilebilirdi. `tests/security/log-safety.test.ts` eklendi.

- **Kural 1 — ilk argüman etiket olmalı.** Çıplak nesne/`Error` ilk argüman, bir
  SDK hata gövdesinin (istek gövdesi dâhil) log'a taşınmasına izin verir. İzin
  verilen: string/şablon literali veya paylaşılan olay adı (`EMAIL_HEALTH_EVENT`).
  Ölçüm: kod tabanında **1** istisna var, o da onaylı `EMAIL_HEALTH_EVENT`.
- **Kural 2 — argümanlarda kimlik ifadesi olmamalı.** İki katman: (a) değer
  biçimleri (`process.env.*_SECRET|TOKEN|KEY`, `formData.get("password")`,
  `.access_token`, `api_key`, `service_role`); (b) dize literalleri **ayıklandıktan
  sonra** çıplak kimlik kelimesi (`password|token|secret|credential|authorization`).
  Ayıklama şart: `"Supabase password update failed."` bir *etiket*, bulgu değil;
  `{ email, password }` bir *değer*, bulgudur. Ölçüm: **0** kimlik ifadesi.
- **Kanıt (mutation).** `console.error("sign-in failed", { email, password })`
  + `console.error(error)` içeren bir probe dosyası: kural 1 `console.error(error)`
  satırını, kural 2 `password (bare value)`'yu kırmızıya çevirdi. Probe temizlendi.
  **İlk sürüm kural 2 yalnız değer biçimlerini tarıyordu ve çıplak `password`
  değişkenini kaçırdı** — bu yanlış-negatif mutation sırasında ölçüldü ve dize
  ayıklamalı kelime taraması eklendi.
- **Bilinçli sınır (sessiz değil).** Kaynak-metin taraması; bir kimliği önce
  yerel değişkene alıp sonra loglayan bir zincir (`const p = …; console.error(l, p)`)
  görülmez. Bugün böyle bir zincir yok.

### 35. tur — log güvenliği kapsamı: `scripts/**` (kendi alanını tarama)

34. turdaki kapı `src` + `supabase/functions` tarıyordu. Ama CI'da **en ayrıcalıklı**
token'larla koşan yüzey `scripts/**`'tır: `GH_TOKEN`, `VERCEL_TOKEN`,
`SUPABASE_ACCESS_TOKEN`. Bir deploy script'inde `console.error(\`… ${process.env.GH_TOKEN}\`)`
eski kapsamda **sessizce yeşil** kalıyordu (ölçüldü: probe eklendiğinde eski ROOTS
0 kırmızı, yeni ROOTS 1 kırmızı).

- **Kapsam kararı, ölçümle.** Kural 2 (kimlik ifadesi) `scripts/**`'e genişletildi:
  ölçüm **0** yanlış-pozitif (kod tabanında `scripts`'te hiçbir `console.*` çağrısı
  kimlik ifadesi içermiyor). Kural 1 (ilk argüman etiketi) genişletil**medi**: `scripts`
  CLI'ları bilinçli olarak `error.message` / `JSON.stringify(findings)` yazıyor —
  11 yanlış-pozitif, teşhis amaçlı, kimlik değil. İki kuralın kapsamı bu yüzden ayrı
  (`literalFirstArgumentFiles`).
- **Kanıt (mutation).** `scripts/probe-token-leak.mjs` (`console.error(\`auth failed
  with ${process.env.GH_TOKEN}\`)`): eski ROOTS → 0 kırmızı; yeni ROOTS → kural 2
  kırmızı (`process.env.GH_TOKEN`). Probe silindi; 6/6 yeşil. Bir self-test ROOTS'un
  `scripts`'i içerdiğini ve kural 1'in içermediğini ratchet'ler.
