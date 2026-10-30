-- Feedback / contact submissions.
--
-- Deliberately NOT the same thing as `audit_logs`: that table is the
-- tamper-evident security trail and must never hold free-form visitor text.
-- Feedback is user-generated content with a lifecycle of its own (triage,
-- reply, retention), so it lives in its own table.
--
-- Rows are written only through `submit_feedback`, which normalises and bounds
-- every field. The table is readable by the service role alone; the visitor who
-- submitted it gets a confirmation email, not read access.

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text check (name is null or pg_catalog.char_length(name) between 1 and 80),
  email text check (email is null or pg_catalog.char_length(email) between 3 and 254),
  category text not null
    check (category in ('general', 'bug', 'feature', 'employer', 'candidate', 'other')),
  rating integer check (rating is null or rating between 1 and 5),
  message text not null check (pg_catalog.char_length(message) between 3 and 4000),
  locale text not null default 'tr',
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'archived')),
  created_at timestamptz not null default pg_catalog.now()
);

create index feedback_submissions_recent_idx
  on public.feedback_submissions (created_at desc);

create index feedback_submissions_status_idx
  on public.feedback_submissions (status, created_at desc);

alter table public.feedback_submissions enable row level security;
revoke all on table public.feedback_submissions from public, anon, authenticated;
grant select, update on table public.feedback_submissions to service_role;

create or replace function public.submit_feedback(
  _name text,
  _email text,
  _category text,
  _rating integer,
  _message text,
  _locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_name text;
  v_email text;
  v_message text;
  v_category text;
  v_locale text;
  v_rating integer;
  v_id uuid;
begin
  -- Attribute the row only to a profile that still exists. A stale session
  -- (deleted account) resolves auth.uid() to a uuid with no profiles row, and
  -- writing it would fail the whole submission with a foreign-key error.
  select id into v_actor from public.profiles where id = (select auth.uid());

  v_message := pg_catalog.btrim(coalesce(_message, ''));
  if pg_catalog.char_length(v_message) < 3
     or pg_catalog.char_length(v_message) > 4000 then
    raise exception 'The feedback message length is invalid.'
      using errcode = '22023';
  end if;

  v_category := case
    when _category in ('general', 'bug', 'feature', 'employer', 'candidate', 'other')
      then _category
    else 'general'
  end;

  v_locale := case
    when _locale in ('tr', 'en', 'ru', 'el', 'fa', 'de') then _locale
    else 'tr'
  end;

  v_name := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_name, '')), 80), '');

  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(_email, ''))), '');
  if v_email is not null
     and (
       pg_catalog.char_length(v_email) < 3
       or pg_catalog.char_length(v_email) > 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     ) then
    raise exception 'The feedback email address is invalid.'
      using errcode = '22023';
  end if;

  if _rating is null then
    v_rating := null;
  elsif _rating between 1 and 5 then
    v_rating := _rating;
  else
    raise exception 'The feedback rating is invalid.'
      using errcode = '22023';
  end if;

  insert into public.feedback_submissions (
    user_id, name, email, category, rating, message, locale
  ) values (
    v_actor, v_name, v_email, v_category, v_rating, v_message, v_locale
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_feedback(text, text, text, integer, text, text)
  from public;
grant execute on function public.submit_feedback(text, text, text, integer, text, text)
  to anon, authenticated;
