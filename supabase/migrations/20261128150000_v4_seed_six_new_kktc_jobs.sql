-- İşBul KKTC: 6 yeni doğrulanmış KKTC işvereni ve 6 aktif platform ilanı.
-- İdempotent: `auth.users` + `public.companies` + `public.jobs` satırları
-- `ON CONFLICT (id) DO NOTHING` ile yeniden çalıştırıldığında tekrar müdahale etmez.
-- Tüm ilan metinleri ayrımcı/cinsiyet kısıtı içermiyor; yalnızca meslek ve
-- işletme tabanlı, yasal iş İlanı dilinde yazılmıştır.
begin;

-- İşBul platform operasyon kullanıcısı. `on_auth_user_created` tetikleyicisi
-- buna karşılık public.profiles satırını oluşturur (status = 'active').
-- created_by / reviewed_by dış anahtarları bu kimlik üzerinden bağlanır.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '50000000-0000-5000-8000-000000000001',
  'platform-operasyon@isbulkktc.test',
  '{"display_name":"İşBul Platform Operasyonu"}'
)
on conflict (id) do nothing;

-- 6 doğrulanmış KKTC işvereni (verification_status = 'verified').
insert into public.companies (
  id, name, slug, verification_status, profile_description, categories,
  municipality, public_email, phone
)
values
  (
    '50000000-0000-5001-8000-000000000001',
    'Girne Otel & Turizm İşletmesi',
    'girne-otel-turizm-isletmesi',
    'verified',
    'Girne merkezli turizm işletmesi; otel konaklama, restoran ve havalimanı hizmetleri.',
    '{}'::text[],
    'Girne',
    null,
    '0545 647 86 45'
  ),
  (
    '50000000-0000-5001-8000-000000000002',
    'Lefkoşa Perakende Mağazacılık',
    'lefkosa-perakende-magazacilik',
    'verified',
    'Lefkoşa merkezli perakende mağaza işletmesi; gıda, temizlik ve kıyafet satışı.',
    '{}'::text[],
    'Lefkoşa',
    null,
    '0533 863 20 00'
  ),
  (
    '50000000-0000-5001-8000-000000000003',
    'Serena Group',
    'serena-group',
    'verified',
    'Lefkoşa merkezli hizmet ve ticaret grubu; muhasebe, danışmanlık ve operasyon faaliyetleri.',
    '{}'::text[],
    'Lefkoşa',
    'muhasebe@serenagrup.com',
    '0542 881 21 33'
  ),
  (
    '50000000-0000-5001-8000-000000000004',
    'KKTC Restoran & Kafe İşletmesi',
    'kktc-restoran-kafe-isletmesi',
    'verified',
    'Lefkoşa merkezli restoran ve kafe işletmesi; servis ve mutfak ekipleri.',
    '{}'::text[],
    'Lefkoşa',
    null,
    '0536 743 34 84'
  ),
  (
    '50000000-0000-5001-8000-000000000005',
    'Gözel Beauty',
    'gozel-beauty',
    'verified',
    'Lefkoşa Yenikent merkezli güzellik merkezi; kuaför, cilt ve bakım hizmetleri.',
    '{}'::text[],
    'Lefkoşa',
    null,
    '0548 823 68 10'
  ),
  (
    '50000000-0000-5001-8000-000000000006',
    'Benli Süpermarket',
    'benli-supermarket',
    'verified',
    'Lefkoşa merkezli market zinciri; unlu mamüller, mayalı ürünler ve gıda satışı.',
    '{}'::text[],
    'Lefkoşa',
    'ik@benligida.com',
    '+90 548 850 53 09'
  )
on conflict (id) do nothing;

-- 6 aktif, doğrulanmış platform ilanı (status = 'published') ve
-- platform operasyonu personeli tarafından incelenmiş/yayınlanmış.
insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at
)
values
  (
    '50000000-0000-5002-8000-000000000001',
    '50000000-0000-5001-8000-000000000001',
    '50000000-0000-5000-8000-000000000001',
    'Havalimanı Karşılama Personeli',
    'havalimani-karsilama-personeli',
    'Girne oteli havalimanı karşılama personeli için aktif ehliyetli ekip arkadaşı aranıyor.',
    'Girne bölgesindeki otel bünyesinde havalimanı karşılama operasyonlarında görev alacak, aktif araç ehliyetine sahip ekip arkadaşı aranmaktadır. Shift tabanlı çalışma, hafta sonu ve resmi tatillerde mevcut olma şartı vardır. İletişim: 0545 647 86 45.',
    'full_time', 'on_site', 'Girne', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  ),
  (
    '50000000-0000-5002-8000-000000000002',
    '50000000-0000-5001-8000-000000000002',
    '50000000-0000-5000-8000-000000000001',
    'Mağaza Satış Danışmanı',
    'magaza-satis-danismani',
    'Lefkoşa perakende mağazasında Pazartesi–Cumartesi 09:00–19:15 arası müşteri odaklı satış danışmanı aranıyor.',
    'Pazartesi–Cumartesi 09:00–19:15 saatleri arasında görev yapacak, müşteri odaklı satış danışmanı aranmaktadır. Nakit ve kart işlemleri, ürün sergileme ve stok takibi sorumluluğu dahil. WhatsApp başvuru: 0533 863 20 00.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  ),
  (
    '50000000-0000-5002-8000-000000000003',
    '50000000-0000-5001-8000-000000000003',
    '50000000-0000-5000-8000-000000000001',
    'Muhasebe Personeli',
    'muhasebe-personeli',
    'Lefkoşa’da ikamet eden, MS Office bilen ve iletişim becerisi güçlü deneyimli muhasebe personeli aranıyor.',
    'Muhasebe alanında deneyimli, iletişim becerileri güçlü, MS Office programlarını etkin kullanabilen ve tercihen Lefkoşa’da ikamet eden muhasebe personeli aranmaktadır. Fatura ve banka işlemleri, vergilendirme ve raporlama görevleri dahil. E-posta: muhasebe@serenagrup.com, Tel: 0542 881 21 33.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  ),
  (
    '50000000-0000-5002-8000-000000000004',
    '50000000-0000-5001-8000-000000000004',
    '50000000-0000-5000-8000-000000000001',
    'Komi, Garson, Salatacı ve Çaycı',
    'komi-garson-salataci-cayci',
    'Lefkoşa restoran ve kafe servis ekibinde komi, garson, salatacı ve çaycı pozisyonları için takım arkadaşı aranıyor.',
    'Restoran ve kafe servis ekibimizde komi, garson, salatacı ve çaycı pozisyonlarında görev alacak takım arkadaşları aranmaktadır. Masa hizmeti, bar işlemleri ve temizlik sorumluluğu dahil. Başvuru Tel: 0536 743 34 84.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  ),
  (
    '50000000-0000-5002-8000-000000000005',
    '50000000-0000-5001-8000-000000000005',
    '50000000-0000-5000-8000-000000000001',
    'Profesyonel Kuaför',
    'profesyonel-kuafur',
    'Lefkoşa Yenikent güzellik merkezinde balyaj, ombre, renklendirme, keratin ve saç kesimi deneyimi olan profesyonel kuaför aranıyor.',
    'Güzellik merkezimizin kuaför bölümünde görev alacak; balyaj, ombre, renklendirme, keratin ve bakım uygulamaları, saç kesimi/şekillendirme ve kaynak saç uygulamalarında deneyimli profesyonel kuaför aranmaktadır. Müşteri danışmanlığı ve randevu yönetimi dahil. İletişim: 0548 823 68 10.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  ),
  (
    '50000000-0000-5002-8000-000000000006',
    '50000000-0000-5001-8000-000000000006',
    '50000000-0000-5000-8000-000000000001',
    'Unlu Mamüller Ustası (Mayalı Ürünler)',
    'unlu-mamuller-ustasi',
    'Lefkoşa’da unlu mamüller ve mayalı ürünler üretiminde deneyimli usta takım arkadaşı aranıyor.',
    'Unlu mamüller ve mayalı ürünler üretiminde deneyimli usta takım arkadaşı aranmaktadır. Ekmek, poğaça, börek ve mayalı hamur işleri sorumluluğu dahil. Başvuru: ik@benligida.com / +90 548 850 53 09.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '50000000-0000-5000-8000-000000000001', now(), now(), now() + interval '90 days'
  )
on conflict (id) do nothing;

commit;
