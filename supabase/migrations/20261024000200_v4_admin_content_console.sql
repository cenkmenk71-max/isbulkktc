-- Administrative read RPCs for the managed-content console.
--
-- The write side already exists (`admin_upsert_site_content`,
-- `admin_upsert_faq_entry`, `admin_upsert_listing_plan`,
-- `admin_upsert_directory_company`), but an administrator could only list FAQ
-- rows. The console needs to show the *current* legal documents and plan
-- definitions before editing them, and the public read RPCs deliberately hide
-- drafts and inactive plans — so they cannot be reused here.
--
-- Same rules as the rest of the schema: `security definer`, gated on
-- `public.has_platform_role` (which already requires an MFA-verified, active
-- administrator), direct table access revoked, execute granted to
-- `authenticated` only.

create or replace function public.admin_list_site_content()
returns table (
  content_key text,
  locale text,
  document jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  return query
  select
    c.content_key,
    c.locale,
    c.document,
    c.updated_at
  from public.site_content as c
  order by c.content_key, c.locale;
end;
$$;

create or replace function public.admin_list_listing_plans()
returns table (
  code text,
  audience text,
  name text,
  blurb text,
  features text[],
  color text,
  listing_count integer,
  price_1 integer,
  price_7 integer,
  price_30 integer,
  is_active boolean,
  sort_order integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  return query
  select
    p.code,
    p.audience,
    p.name,
    p.blurb,
    p.features,
    p.color,
    p.listing_count,
    p.price_1,
    p.price_7,
    p.price_30,
    p.is_active,
    p.sort_order,
    p.updated_at
  from public.listing_plans as p
  order by p.sort_order, p.code;
end;
$$;

revoke all on function public.admin_list_site_content()
  from public, anon, authenticated;
revoke all on function public.admin_list_listing_plans()
  from public, anon, authenticated;

grant execute on function public.admin_list_site_content()
  to authenticated;
grant execute on function public.admin_list_listing_plans()
  to authenticated;
