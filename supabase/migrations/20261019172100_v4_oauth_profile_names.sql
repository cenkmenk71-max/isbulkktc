create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := pg_catalog.left(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        coalesce(
          nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
          nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
          nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
          pg_catalog.split_part(coalesce(new.email, ''), '@', 1)
        ),
        '[[:cntrl:]]',
        '',
        'g'
      )
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when pg_catalog.char_length(v_display_name) >= 2 then v_display_name
      else 'Aday'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated;
