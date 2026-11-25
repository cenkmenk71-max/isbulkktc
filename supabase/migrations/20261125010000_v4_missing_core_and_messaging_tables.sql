begin;

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique
    check (char_length(storage_path) between 1 and 512),
  original_filename text not null
    check (char_length(original_filename) between 1 and 255),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  mime_type text not null check (mime_type = 'application/pdf'),
  page_count integer check (page_count is null or page_count between 1 and 25),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'parsed', 'failed', 'deleted')),
  retention_until timestamptz not null default (now() + interval '90 days'),
  parsed_data jsonb
    check (parsed_data is null or (
      jsonb_typeof(parsed_data) = 'object'
      and pg_catalog.pg_column_size(parsed_data) <= 65536
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index resumes_candidate_id_idx on public.resumes (candidate_id);
create index resumes_status_idx on public.resumes (status);
create trigger resumes_set_updated_at
  before update on public.resumes
  for each row execute function public.set_updated_at();

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  version integer not null check (version > 0),
  structured_data jsonb not null
    check (
      jsonb_typeof(structured_data) = 'object'
      and pg_catalog.pg_column_size(structured_data) <= 65536
    ),
  created_at timestamptz not null default now(),
  unique (resume_id, version)
);

create index resume_versions_resume_id_idx on public.resume_versions (resume_id);

create table public.saved_jobs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index saved_jobs_job_id_idx on public.saved_jobs (job_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text check (subject is null or char_length(subject) <= 200),
  status text not null default 'active'
    check (status in ('active', 'archived', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx
  on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 10000),
  message_type text not null default 'text'
    check (message_type in ('text', 'system', 'file')),
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and pg_catalog.pg_column_size(metadata) <= 8192
    ),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index messages_sender_id_idx on public.messages (sender_id);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration text not null
    check (integration in ('ministry_jobs', 'ministry_companies', 'external_api')),
  status text not null check (status in ('running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0 check (records_processed >= 0),
  records_succeeded integer not null default 0 check (records_succeeded >= 0),
  records_failed integer not null default 0 check (records_failed >= 0),
  error_summary text check (error_summary is null or char_length(error_summary) <= 5000),
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and pg_catalog.pg_column_size(metadata) <= 65536
    ),
  check (records_succeeded + records_failed <= records_processed),
  check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create index integration_sync_runs_integration_started_idx
  on public.integration_sync_runs (integration, started_at desc);

alter table public.resumes enable row level security;
alter table public.resumes force row level security;
alter table public.resume_versions enable row level security;
alter table public.resume_versions force row level security;
alter table public.saved_jobs enable row level security;
alter table public.saved_jobs force row level security;
alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_members force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_sync_runs force row level security;

revoke all on table
  public.resumes,
  public.resume_versions,
  public.saved_jobs,
  public.conversations,
  public.conversation_members,
  public.messages,
  public.integration_sync_runs
from public, anon, authenticated;

grant select on public.resumes, public.resume_versions to authenticated;
grant select, insert, delete on public.saved_jobs to authenticated;
grant select on public.conversations, public.conversation_members, public.messages
  to authenticated;
grant insert (conversation_id, sender_id, body, message_type, metadata)
  on public.messages
  to authenticated;
grant select, insert, update on public.integration_sync_runs to service_role;
grant all on public.resumes, public.resume_versions to service_role;
grant all on public.saved_jobs, public.conversations, public.conversation_members,
  public.messages to service_role;

create policy resumes_owner_read
  on public.resumes for select to authenticated
  using (candidate_id = (select auth.uid()));

create policy resume_versions_owner_read
  on public.resume_versions for select to authenticated
  using (exists (
    select 1
    from public.resumes as resume_row
    where resume_row.id = resume_versions.resume_id
      and resume_row.candidate_id = (select auth.uid())
  ));

create policy saved_jobs_owner_select
  on public.saved_jobs for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_jobs_owner_insert
  on public.saved_jobs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.jobs as job_row
      where job_row.id = saved_jobs.job_id
        and job_row.status = 'published'
        and job_row.expires_at > now()
    )
  );

create policy saved_jobs_owner_delete
  on public.saved_jobs for delete to authenticated
  using (user_id = (select auth.uid()));

create policy conversations_member_read
  on public.conversations for select to authenticated
  using (exists (
    select 1
    from public.conversation_members as member_row
    join public.profiles as profile_row
      on profile_row.id = member_row.user_id
    where member_row.conversation_id = conversations.id
      and member_row.user_id = (select auth.uid())
      and member_row.left_at is null
      and profile_row.status = 'active'
  ));

create policy conversation_members_self_read
  on public.conversation_members for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as profile_row
      where profile_row.id = (select auth.uid())
        and profile_row.status = 'active'
    )
  );

create policy messages_member_read
  on public.messages for select to authenticated
  using (exists (
    select 1
    from public.conversation_members as member_row
    join public.profiles as profile_row
      on profile_row.id = member_row.user_id
    where member_row.conversation_id = messages.conversation_id
      and member_row.user_id = (select auth.uid())
      and member_row.left_at is null
      and profile_row.status = 'active'
  ));

create policy messages_member_insert
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and message_type = 'text'
    and metadata = '{}'::jsonb
    and exists (
      select 1 from public.profiles as profile_row
      where profile_row.id = (select auth.uid())
        and profile_row.status = 'active'
    )
    and exists (
      select 1
      from public.conversation_members as member_row
      join public.conversations as conversation_row
        on conversation_row.id = member_row.conversation_id
      where member_row.conversation_id = messages.conversation_id
        and member_row.user_id = (select auth.uid())
        and member_row.left_at is null
        and conversation_row.status = 'active'
    )
  );

create or replace function public.create_resume(
  _candidate_id uuid,
  _storage_path text,
  _original_filename text,
  _file_size_bytes bigint,
  _mime_type text,
  _page_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  actor_id uuid := auth.uid();
begin
  if auth.role() <> 'authenticated'
     or actor_id is null
     or _candidate_id <> actor_id
     or not exists (
       select 1 from public.profiles as profile_row
       where profile_row.id = actor_id and profile_row.status = 'active'
     )
     or left(_storage_path, char_length(actor_id::text) + 1) <> actor_id::text || '/'
  then
    raise exception 'An active candidate may only register their own resume.'
      using errcode = '42501';
  end if;

  insert into public.resumes (
    candidate_id, storage_path, original_filename, file_size_bytes, mime_type, page_count
  )
  values (
    actor_id, _storage_path, _original_filename, _file_size_bytes, _mime_type, _page_count
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.update_resume_status(
  _resume_id uuid,
  _status text,
  _parsed_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the resume processing service may update resume status.'
      using errcode = '42501';
  end if;

  update public.resumes
  set status = _status, parsed_data = _parsed_data
  where id = _resume_id;

  if not found then
    raise exception 'Resume not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.create_resume_version(
  _resume_id uuid,
  _structured_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  created_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the resume processing service may create resume versions.'
      using errcode = '42501';
  end if;

  perform 1 from public.resumes where id = _resume_id for update;
  if not found then
    raise exception 'Resume not found.' using errcode = 'P0002';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.resume_versions
  where resume_id = _resume_id;

  insert into public.resume_versions (resume_id, version, structured_data)
  values (_resume_id, next_version, _structured_data)
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.start_conversation(
  _participant_ids uuid[],
  _subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  other_id uuid;
  created_id uuid;
begin
  if auth.role() <> 'authenticated'
     or actor_id is null
     or coalesce(array_length(_participant_ids, 1), 0) <> 2
     or not actor_id = any(_participant_ids)
     or _participant_ids[1] = _participant_ids[2]
  then
    raise exception 'A conversation must have exactly two distinct participants, including the caller.'
      using errcode = '22023';
  end if;

  other_id := case when _participant_ids[1] = actor_id
    then _participant_ids[2] else _participant_ids[1] end;

  if not exists (
    select 1
    from public.applications as application_row
    join public.jobs as job_row on job_row.id = application_row.job_id
    join public.company_members as member_row
      on member_row.company_id = job_row.company_id
    join public.profiles as candidate_profile
      on candidate_profile.id = application_row.candidate_id
      and candidate_profile.status = 'active'
    join public.profiles as employer_profile
      on employer_profile.id = member_row.user_id
      and employer_profile.status = 'active'
    where application_row.status not in ('withdrawn', 'rejected')
      and member_row.status = 'active'
      and (
        (application_row.candidate_id = actor_id and member_row.user_id = other_id)
        or (application_row.candidate_id = other_id and member_row.user_id = actor_id)
      )
  ) then
    raise exception 'Conversation participants must share an active application.'
      using errcode = '42501';
  end if;

  insert into public.conversations (subject)
  values (nullif(btrim(_subject), ''))
  returning id into created_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (created_id, actor_id, 'owner'),
    (created_id, other_id, 'member');

  return created_id;
end;
$$;

create or replace function public.send_message(
  _conversation_id uuid,
  _body text,
  _message_type text default 'text',
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  created_id uuid;
begin
  if auth.role() <> 'authenticated'
     or actor_id is null
     or _message_type <> 'text'
     or coalesce(_metadata, '{}'::jsonb) <> '{}'::jsonb
     or not exists (
       select 1
       from public.conversation_members as member_row
       join public.conversations as conversation_row
         on conversation_row.id = member_row.conversation_id
       where member_row.conversation_id = _conversation_id
         and member_row.user_id = actor_id
         and member_row.left_at is null
         and conversation_row.status = 'active'
     )
  then
    raise exception 'Only active conversation members may send text messages.'
      using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (_conversation_id, actor_id, btrim(_body))
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.archive_conversation(_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated'
     or not exists (
       select 1
       from public.conversation_members as member_row
       where member_row.conversation_id = _conversation_id
         and member_row.user_id = auth.uid()
         and member_row.role = 'owner'
         and member_row.left_at is null
     )
  then
    raise exception 'Only the active conversation owner may archive it.'
      using errcode = '42501';
  end if;

  update public.conversations
  set status = 'archived'
  where id = _conversation_id and status = 'active';
end;
$$;

create or replace function public.log_integration_sync(
  _integration text,
  _status text,
  _records_processed integer,
  _records_succeeded integer,
  _records_failed integer,
  _error_summary text default null,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the integration service may log synchronization runs.'
      using errcode = '42501';
  end if;

  insert into public.integration_sync_runs (
    integration, status, finished_at, records_processed, records_succeeded,
    records_failed, error_summary, metadata
  )
  values (
    _integration,
    _status,
    case when _status = 'running' then null else now() end,
    _records_processed,
    _records_succeeded,
    _records_failed,
    _error_summary,
    coalesce(_metadata, '{}'::jsonb)
  )
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_resume(uuid, text, text, bigint, text, integer)
  from public, anon, authenticated;
revoke all on function public.update_resume_status(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_resume_version(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_conversation(uuid[], text)
  from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.archive_conversation(uuid)
  from public, anon, authenticated;
revoke all on function public.log_integration_sync(text, text, integer, integer, integer, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_resume(uuid, text, text, bigint, text, integer)
  to authenticated;
grant execute on function public.update_resume_status(uuid, text, jsonb)
  to service_role;
grant execute on function public.create_resume_version(uuid, jsonb)
  to service_role;
grant execute on function public.start_conversation(uuid[], text)
  to authenticated;
grant execute on function public.send_message(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.archive_conversation(uuid)
  to authenticated;
grant execute on function public.log_integration_sync(text, text, integer, integer, integer, text, jsonb)
  to service_role;

commit;
