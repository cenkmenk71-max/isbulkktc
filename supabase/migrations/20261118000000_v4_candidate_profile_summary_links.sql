alter table public.candidate_profiles
  add column summary text
    check (summary is null or char_length(summary) <= 2000),
  add column links jsonb not null default '[]'::jsonb
    check (public.is_valid_candidate_profile_section(
      links, array['label','url'], 12, 2000));

grant insert (summary, links), update (summary, links)
  on public.candidate_profiles to authenticated;