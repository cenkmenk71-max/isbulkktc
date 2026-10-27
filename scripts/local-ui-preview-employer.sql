with company as (
  insert into public.companies (
    name,
    slug,
    verification_status,
    profile_description,
    categories,
    website,
    phone,
    public_email,
    address,
    municipality
  )
  values (
    'Northstar Studio (Preview)',
    'local-demo-northstar-preview',
    'pending',
    'A local-only example company profile for reviewing the employer workspace.',
    array['Design', 'Technology'],
    'https://example.test',
    '+90 392 555 0101',
    'hello@example.test',
    'Demo address, 12',
    'Kyrenia'
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    profile_description = excluded.profile_description,
    categories = excluded.categories,
    website = excluded.website,
    phone = excluded.phone,
    public_email = excluded.public_email,
    address = excluded.address,
    municipality = excluded.municipality
  returning id
),
owner as (
  insert into public.company_members (
    company_id,
    user_id,
    membership_role,
    status
  )
  select company.id, auth_user.id, 'owner', 'active'
  from company
  cross join auth.users as auth_user
  where auth_user.email = 'local-demo-employer@example.test'
  on conflict (company_id, user_id) do update
  set membership_role = 'owner', status = 'active'
  returning company_id, user_id
)
insert into public.company_profile_submissions (
  company_id,
  submitted_by,
  company_name,
  profile_description,
  categories,
  website,
  phone,
  public_email,
  address,
  municipality,
  status
)
select
  owner.company_id,
  owner.user_id,
  'Northstar Studio',
  'A synthetic local company profile to demonstrate editable employer details and the pending review status.',
  array['Product design', 'Digital services'],
  'https://example.test',
  '+90 392 555 0101',
  'contact@example.test',
  'Demo address, 12',
  'Kyrenia',
  'pending'
from owner
on conflict (company_id) where status = 'pending' do update
set
  company_name = excluded.company_name,
  profile_description = excluded.profile_description,
  categories = excluded.categories,
  website = excluded.website,
  phone = excluded.phone,
  public_email = excluded.public_email,
  address = excluded.address,
  municipality = excluded.municipality
