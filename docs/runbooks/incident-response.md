# Runbook: V4 güvenlik olayı

Bu runbook çalışma sözleşmesidir; alarm, on-call nöbeti veya olay müdahale
SaaS'ı henüz kurulmuş olduğunu iddia etmez. Gerçek kişi/iletişim ve yasal
bildirim eşikleri işletme ve hukuk sahibi tarafından onaylanmalıdır.

## Tetikleyiciler

- Admin rolü/kritik fonksiyonun beklenmeyen çağrısı, kimlik bilgisi veya
  service-role secret sızıntısı, tanımsız public Storage nesnesi.
- Şirketler arası IDOR/RLS kaçağı, özel CV/dekont URL'sinin paylaşımı.
- Mükerrer banka referansı, iki kredi tahsisi, ledger/bakiye farkı.
- Ani başarısız giriş, upload/parser/DB hata yükselişi veya yedek hatası.

## Müdahale sırası

1. UTC zamanını, olay sınıfını, test/live ortamını, rapor eden kişiyi ve
   etkilenen domain'i kaydet. E-posta, token, CV, dekont/IBAN, parolayı
   incident log'a ekleme.
2. Para veya PII riski varsa etkilenen özelliği/endpoint'i kapat ve onaylı
   ekip kanalından işletme sahibine haber ver. Gerçek paranın işlenmesini
   durdur; tabloyu doğrudan update/delete etme.
3. Sadece gerekli read-only request ID, Supabase Auth olayı, role change ve
   audit ID'lerini koru. Delili public depoya ya da paylaşılan ekran görüntüsüne
   koyma.
4. Kök nedeni doğrula; erişimi daralt. Secret açığa çıktıysa etkilenen anahtarı
   revoke/rotate et, preview/production ortamlarını ayrı doğrula.
5. Migration/izin/backup düzeltmesini code review, CI ve pgTAP'tan geçir;
   canlıya kontrollü yayınla. Güvenli değilse geri al, manuel veri yazma.
6. Etkilenen kayıt sayısı/zamanını privacy owner değerlendirsin; bildirim,
   düzenleyici/hukuki sorumluluğu işletme uzmanı belirlesin.
7. Başlangıç, etki/PII scope, stop-the-bleed zamanı, secret rotation,
   düzeltme build/test ID'si ve kullanıcıya güvenli bilgilendirme adımlarını
   hassas alan içermeyen postmortem olarak sakla.

## Tamamlanma ölçütü

Saldırı yolunun negatif testle kapanması, kimliklerin rotasyonu, sahiplik/
para defteri uzlaştırması, gerekiyorsa geri yükleme doğrulaması ve
değişiklik kanıtının CI kaydı olmadan olayı çözülmüş sayma.
