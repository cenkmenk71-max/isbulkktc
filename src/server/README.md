# Server-only security boundary

`auth/` oturum ve dar rol doğrulamaları; `dal/` kullanıcı/şirket kapsamlı
erişim ile explicit DTO; `db/` kullanıcı scope'lu SSR Supabase client;
`policies/` domain izinleri; `audit/` redakte edilmiş append-only kayıtlar
içindir. Ayrıcalıklı server kodu başında `import "server-only"` bulunur.

Next.js Server Component, Server Action ve Route Handler'da her isteğe ait
yeni Supabase SSR client kullanılır. Tarayıcı session'ını `getSession()` veya
değiştirilebilir claim ile doğrulamayın; server tarafından doğrulanan
`auth.getUser()` ile DAL'de oturumu doğrulayın, sonra RLS ve kaynak/üyelik
denetimini yapın. Cookie yenilemesini Next.js 16 `proxy.ts` içinde yapın.

Normal sorgular publishable anahtarlı, kullanıcı cookie/session kapsamındaki
client kullanır; `service_role` rutin sorgu yolu, client bundle veya `.env`
örnek değeri değildir. Sunucu eylemleri girdi şemasını doğrular ve owner, role,
üyelik, işlem durumu ve idempotency'yi DB kısıtlarıyla tekrar doğrular.
Yanıtları minimum DTO'larla sınırlandırın; parola, token, CV içeriği, dekont,
IBAN, e-posta veya kişisel metadata'yı loglamayın.

Supabase `auth.getClaims()` proxy'de **oturum yenileme** içindir, yetki kararı
değildir. Yalnız gerekli statik varlıkları proxy matcher dışında bırakın;
sayfa ve veri için güvenlik denetimi DAL/DB'ye en yakın noktada bulunmalıdır.
Next.js'in kurulu sürüm rehberini açmadan auth/Proxy API'sini değiştirmeyin.
