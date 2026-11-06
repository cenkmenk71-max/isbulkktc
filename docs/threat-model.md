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
