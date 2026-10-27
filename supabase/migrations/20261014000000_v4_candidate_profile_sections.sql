create or replace function public.is_valid_candidate_profile_section(
  _entries jsonb,
  _allowed_fields text[],
  _maximum_entries integer,
  _maximum_field_length integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_entry jsonb;
begin
  if _entries is null
     or pg_catalog.jsonb_typeof(_entries) <> 'array'
     or pg_catalog.jsonb_array_length(_entries) > _maximum_entries then
    return false;
  end if;

  for v_entry in
    select entry.value
    from pg_catalog.jsonb_array_elements(_entries) as entry(value)
  loop
    if pg_catalog.jsonb_typeof(v_entry) <> 'object'
       or exists (
         select 1
         from pg_catalog.jsonb_each(v_entry) as field(key, value)
         where not (field.key = any (_allowed_fields))
            or pg_catalog.jsonb_typeof(field.value) <> 'string'
            or pg_catalog.char_length(field.value #>> '{}') > _maximum_field_length
       ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.is_valid_candidate_profile_section(jsonb, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.is_valid_candidate_profile_section(jsonb, text[], integer, integer)
  to authenticated;

alter table public.candidate_profiles
  add column experience jsonb not null default '[]'::jsonb
    check (
      public.is_valid_candidate_profile_section(
        experience,
        array['role', 'organization', 'location', 'startDate', 'endDate', 'description'],
        12,
        2000
      )
    ),
  add column education jsonb not null default '[]'::jsonb
    check (
      public.is_valid_candidate_profile_section(
        education,
        array['institution', 'qualification', 'field', 'startDate', 'endDate', 'description'],
        12,
        2000
      )
    ),
  add column languages jsonb not null default '[]'::jsonb
    check (
      public.is_valid_candidate_profile_section(
        languages,
        array['name', 'proficiency'],
        12,
        2000
      )
    ),
  add column certifications jsonb not null default '[]'::jsonb
    check (
      public.is_valid_candidate_profile_section(
        certifications,
        array['name', 'issuer', 'issueDate', 'expiryDate'],
        12,
        2000
      )
    );

revoke insert (visibility), update (visibility)
  on public.candidate_profiles
  from authenticated;

grant insert (experience, education, languages, certifications)
  on public.candidate_profiles
  to authenticated;

grant update (experience, education, languages, certifications)
  on public.candidate_profiles
  to authenticated;
