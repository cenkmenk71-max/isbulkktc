# ADR 0001 — V4 modüler monolit ve veri yetki sınırı

- **Durum:** Kabul edildi (ürün için mimari yön).
- **Kapsam:** Yeni `isbulkktc` sistemi; deploy/uygulama sağlığının kanıtı değildir.
- **Bağlayıcı kaynak:** `../architecture-v4.md` §2, §3, §5, §9, §20.

## Karar

Next.js App Router uygulamasında tek modüler monolit ve Supabase/PostgreSQL
kullan. Auth session'ı Supabase doğrular; korunan Next.js DAL ve açık DTO
sunucu izinlerini denetler; DB RLS, SQL grant, trigger, constraint ve
transaction'lar kaynak sınırı ile veri değişmezliğini zorlar. Modüller başka
modülün tablosunu doğrudan değiştirmez. İstemci Three.js yalnız görsel
enhancement'tır. Ödeme başta manuel IBAN mutabakatıdır.

## Sonuçlar

- İlk ekip/ölçek için mikroservis, cluster/Kubernetes ve harici arama motoru
  yok. Veri değişmezliği ve RLS testi release gate'tir.
- Aday ile işveren kimlikleri aynı kullanıcıda birlikte bulunabilir. Global
  employer rolü yerine aktif şirket üyeliği ve explicit izin gerekir.
- Auth browser publishable anahtarıyla user-scoped kalır; admin/service-role
  normal kullanıcı yolunda açıkça yasaktır.
- Aşamalı teslim, ölçülmüş ihtiyaç, harici sağlayıcı gizliliği ve operasyon
  güvencesi olmadan LLM/banka feed/API/3D'yi production'a etkinleştirmez.
- Bağlantı maliyeti: her yeni modüle migration, test, DTO/policy, e2e ve
  operasyon runbook'u gerekir; V4 solo yol haritası ve release gates buna göre.

## İlk uygulama kapsamı

Migration `20261013000000_v4_identity_companies_security.sql` kullanıcı
profili/role, aday profili, şirket ve üyeliğin kapalı-varsayılan RLS/grant
temelini; atomik pending şirket+owner RPC'sini ve redakte audit insert'ini
kurar. İlk `identity_companies_rls.test.sql` yalnız Docker üzerinde
`supabase test db` ile gerçek DB testinden sonra geçilmiş sayılır.

## Yeniden değerlendirme koşulu

Hedef yük/profil, gerçek arama testi, sınır-aşılan performans/metrik, yeni
işveren yetki kararı, doğrulanmış banka/region sağlayıcı veya yeni hukuki
zorunluluk ADR'yi değiştirir; yalnız özellik isteği veya tahmini trafik
dağıtık sistem kararı için yeterli değildir.
