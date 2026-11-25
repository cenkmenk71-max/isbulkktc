begin;

alter table public.profiles force row level security;
alter table public.user_roles force row level security;
alter table public.candidate_profiles force row level security;
alter table public.companies force row level security;
alter table public.company_members force row level security;
alter table public.audit_logs force row level security;
alter table public.jobs force row level security;
alter table public.applications force row level security;
alter table public.job_packages force row level security;
alter table public.company_job_package_assignments force row level security;
alter table public.company_profile_submissions force row level security;
alter table public.company_directory_overrides force row level security;
alter table public.application_events force row level security;
alter table public.notifications force row level security;
alter table public.notification_email_outbox force row level security;
alter table public.feedback_submissions force row level security;
alter table public.sales_leads force row level security;
alter table public.push_subscriptions force row level security;
alter table public.push_notification_preferences force row level security;
alter table public.support_threads force row level security;
alter table public.support_messages force row level security;
alter table public.site_content force row level security;
alter table public.faq_entries force row level security;
alter table public.listing_plans force row level security;
alter table public.job_source_imports force row level security;
alter table public.application_contact_shares force row level security;

update public.candidate_profiles
set location = 'Mağusa'
where location = 'Gazimağusa';

update public.companies
set municipality = 'Mağusa'
where municipality = 'Gazimağusa';

update public.company_profile_submissions
set municipality = 'Mağusa'
where municipality = 'Gazimağusa';

update public.company_directory_overrides
set municipality = 'Mağusa'
where municipality = 'Gazimağusa';

alter table public.candidate_profiles
  validate constraint candidate_profiles_location_northern_cyprus_district;

alter table public.companies
  validate constraint companies_municipality_northern_cyprus_district;

alter table public.company_profile_submissions
  validate constraint company_profile_submissions_municipality_northern_cyprus_district;

alter table public.company_directory_overrides
  validate constraint company_directory_overrides_municipality_northern_cyprus_district;

-- Replace the older links check without rewriting potentially longer legacy rows.
alter table public.candidate_profiles
  alter column links set default '[]'::jsonb,
  alter column links set not null,
  drop constraint candidate_profiles_links_check,
  add constraint candidate_profiles_links_section_valid_check
    check (public.is_valid_candidate_profile_section(
      links, array['label', 'url'], 12, 600
    )) not valid,
  add column cv_full_text text,
  add constraint candidate_profiles_cv_full_text_length_check
    check (cv_full_text is null or char_length(cv_full_text) <= 100000),
  add column phone text
    check (phone is null or char_length(phone) <= 80),
  add column job_type_preference text[] not null default '{}'
    check (
      cardinality(job_type_preference) <= 6
      and job_type_preference <@ array[
        'full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance'
      ]::text[]
    ),
  add column workplace_mode_preference text[] not null default '{}'
    check (
      cardinality(workplace_mode_preference) <= 3
      and workplace_mode_preference <@ array['on_site', 'hybrid', 'remote']::text[]
    ),
  add column salary_expectation text
    check (salary_expectation is null or char_length(salary_expectation) <= 120),
  add column availability text
    check (availability is null or char_length(availability) <= 80);

alter table public.candidate_profiles
  validate constraint candidate_profiles_links_section_valid_check;

revoke insert, update on table public.candidate_profiles
  from public, anon, authenticated;
revoke insert (visibility), update (visibility)
  on table public.candidate_profiles
  from public, anon, authenticated;

grant insert (
  user_id,
  headline,
  location,
  skills,
  experience,
  education,
  languages,
  certifications,
  summary,
  links,
  cv_full_text,
  phone,
  job_type_preference,
  workplace_mode_preference,
  salary_expectation,
  availability
)
  on table public.candidate_profiles to authenticated;

grant update (
  user_id,
  headline,
  location,
  skills,
  experience,
  education,
  languages,
  certifications,
  summary,
  links,
  cv_full_text,
  phone,
  job_type_preference,
  workplace_mode_preference,
  salary_expectation,
  availability
)
  on table public.candidate_profiles to authenticated;

commit;
