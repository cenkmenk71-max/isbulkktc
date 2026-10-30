-- 20261020180000 and 20261020190000 declared the district constraints NOT VALID
-- so the Gazimağusa -> Mağusa rewrite could land without a full scan, then never
-- validated them. A NOT VALID check still guards new writes, but it silently skips
-- every pre-existing row, so the protection is weaker than it looks.
--
-- All four validate cleanly against the current data, so this only has to run once.
-- VALIDATE CONSTRAINT is a no-op on an already-valid constraint, so re-running the
-- migration set stays safe.
alter table public.candidate_profiles
  validate constraint candidate_profiles_location_northern_cyprus_district;

alter table public.companies
  validate constraint companies_municipality_northern_cyprus_district;

alter table public.company_profile_submissions
  validate constraint company_profile_submissions_municipality_northern_cyprus_district;

alter table public.company_directory_overrides
  validate constraint company_directory_overrides_municipality_northern_cyprus_district;
