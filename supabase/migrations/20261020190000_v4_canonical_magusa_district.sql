alter table public.candidate_profiles
  drop constraint candidate_profiles_location_northern_cyprus_district;

alter table public.companies
  drop constraint companies_municipality_northern_cyprus_district;

alter table public.company_profile_submissions
  drop constraint company_profile_submissions_municipality_northern_cyprus_district;

alter table public.company_directory_overrides
  drop constraint company_directory_overrides_municipality_northern_cyprus_district;

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
  add constraint candidate_profiles_location_northern_cyprus_district
    check (
      location is null
      or location in (
        'Lefkoşa',
        'Mağusa',
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
        'Mağusa',
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
        'Mağusa',
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
        'Mağusa',
        'Girne',
        'Güzelyurt',
        'İskele',
        'Lefke'
      )
    ) not valid;
