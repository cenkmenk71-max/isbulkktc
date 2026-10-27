# Domain feature modules

V4 modüler monolitinin ürün kuralları şirket/kullanıcı kimlik sınırları içinde
bulunur. Uygulanan dikey akışlar `identity`, `companies` ve
`candidates` modülleridir. Aday profil formu yalnız doğrulanmış kullanıcının
mesleki başlığını, konumunu ve becerilerini kaydeder; kullanıcı kimliği
sunucu oturumundan alınır ve `candidate_profiles` RLS politikasıyla kendi
kaydına sınırlandırılır.

`jobs` ve `applications` artık güvenli bir backend temeline sahiptir: şirket
taslakları, doğrulanmış şirketten moderasyona gönderim, platform yöneticisi
incelemesi, yayımlanmış ilan araması, aday başvuruları ve kapsamlı başvuru
durum geçişleri. İş paketleri yönetici tarafından tanımlanır ve doğrulanmış
şirkete atanır; eşzamanlı aktif ilan sınırı ile ilan süresi atama anında
snapshot edilir ve yayınlama anında atomik denetlenir. Sipariş, ödeme veya kredi
defteri yoktur. Paket kataloğu varsayılan kayıt içermez; katalog boşken ilan
yayımlama kapalıdır. Kullanıcıya dönük ilan/başvuru sayfaları ve CV ekleri henüz
uygulanmamıştır.

`resumes`, `chat` ve `ministry` V4 hedef kapsamındadır; tamamlanmış ürün
akışları değildir. Paket yönetimi için güvenli admin RPC'leri vardır; admin UI
artık `/admin/packages` altında TOTP/AAL2 doğrulamasıyla paket tanımı, katalog
durumu ve doğrulanmış şirkete hak snapshot'lı atama sunar. `has_platform_role`
ve admin RPC'leri doğrudan PostgREST çağrılarında da AAL2 ister. İlk
platform-admin rolü, e-posta doğrulanmış operatör hesabından sonra tek seferlik
Supabase Dashboard SQL bootstrap runbook'u ile verilir. Üretim projesine
migration uygulama, hesabın gerçek MFA kurulumu ve production doğrulaması
henüz yapılmış değildir; bunlar canlı servise erişim ve açık onay bekler.

- Modülün tablo ve dış servislerini diğer modüller doğrudan değiştirmez; açık
  sunucu servis arayüzü ve V4 DAL/DTO ile erişir.
- `candidate`, `platform_admin` veya `employer` bilgisini istemci formundan ya
  da değiştirilebilir Auth metadata'sından yetki olarak kabul etmeyin. Şirket
  hakkı, işlem yapılan `company_id` içindeki aktif üyelik+izinle belirlenir.
- Paket hakları ve kaynak sahipliğini server-side doğrulayın; harici servislerde
  açık adapter/timeouts olmadan uçtan uca başarı varmış gibi fallback yapmayın.
- İşlev, pozitif ve negatif test, hata/idempotency sözleşmesi ve gerektiği
  yerde yetkili RLS migration'ıyla beraber tamamlanır.
