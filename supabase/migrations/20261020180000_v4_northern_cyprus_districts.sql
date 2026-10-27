alter table public.candidate_profiles
  add constraint candidate_profiles_location_northern_cyprus_district
    check (
      location is null
      or location in (
        'Lefkoşa',
        'Gazimağusa',
        'Girne',
        'Güzelyurt',
        'İskele',
        'Lefke'
      )
    ) not valid;

alter table public.companies
  add constraint companies_municipality_northern_cyprus_district
    check (
      municipality is null
      or municipality in (
        'Lefkoşa',
        'Gazimağusa',
        'Girne',
        'Güzelyurt',
        'İskele',
        'Lefke'
      )
    ) not valid;

alter table public.company_profile_submissions
  add constraint company_profile_submissions_municipality_northern_cyprus_district
    check (
      municipality is null
      or municipality in (
        'Lefkoşa',
        'Gazimağusa',
        'Girne',
        'Güzelyurt',
        'İskele',
        'Lefke'
      )
    ) not valid;

alter table public.company_directory_overrides
  add constraint company_directory_overrides_municipality_northern_cyprus_district
    check (
      municipality is null
      or municipality in (
        'Lefkoşa',
        'Gazimağusa',
        'Girne',
        'Güzelyurt',
        'İskele',
        'Lefke'
      )
    ) not valid;
