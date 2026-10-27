# Runbook: veritabanı geri yükleme provası

## Ön koşullar

- RPO/RTO hedefi, Supabase plan/region/yedek/PITR kabiliyeti kanıtıyla ve
  ürün sahibiyle imzalanmış olmalı; V4'teki başlangıç önerisi garanti değildir.
- Production sırrı veya CV/receipt fixture'ı kullanılmayan izole restore
  projesi/hesabı ile iki yetkili tarafından onaylı pencere seç.
- Hangi Supabase PostgreSQL/Storage yedeklerinin bulunduğunu, şifreleme
  durumunu, yedek yaşı ve saklama sınırını kaydet. Bugün bu bilgiler
  yapılandırılmadı; gerçek restore henüz çalıştırılamaz.

## Prova

1. Tarih/saat ve drill scope'unu kaydet; test kimlik bilgisiyle yeni, boş,
   erişimi kapalı bir Supabase test projesi hazırla.
2. Denetlenen yedeği CLI/dashboard'ın belgelenmiş restore prosedürü ile al;
   production override/env export riskine karşı hedef proje ID'sini iki kez
   doğrula.
3. Migration'ları güvenli sırayla doğrula; şema version/hash, enum,
   constraint, trigger, RLS/grant/policy ve Storage private/public
   bucket yapılandırmasını aynı release commit'iyle karşılaştır.
4. Test hesaplarıyla pgTAP'i çalıştır; hesap tablosu tutarlılığını (ileride
   ledger-balance yeniden hesaplaması dahil), Auth girişini, private dosya
   negatif erişimini ve public olmayan şirketi doğrula.
5. Restore'un bitiş süresini, geri gelen en yeni veri zamanını ve dosya
   tutarlılığını ölçerek RTO/RPO ile karşılaştır; hedef aşılmışsa block olarak
   raporla.
6. Geçici çevre/dökümü korumalı alanda saklayıp retention onayına göre
   güvenli imha et; canlı production'ı asla test amacıyla restore üzerine yazma.
7. Test, şema hash'i, migration, süre, başarısız/kalan adım ve onayları
   hassas payload/credential içermeyen kanıtla kaydet.

## Başarı ölçütü

Boş olmayan test DB'de bütün migration, RLS/grant denial ve kritik akış testleri
geçer; restore edilen dosya/DB uyuşur; gözlenen RPO/RTO onaylı hedefi sağlar;
temizleme ve erişim kontrolü doğrulanır. Bu adımlar çalıştırılmadan
“yedeklemeden dönebilir” denmez.
