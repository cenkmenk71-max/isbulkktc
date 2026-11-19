-- The candidate workspace reads and writes a plain-text copy of the parsed
-- résumé (`cv_full_text`). It was added to the app in 81d3cb9 without a
-- migration, so every `/profile/dashboard` load in production failed with
-- `42703 column candidate_profiles.cv_full_text does not exist` and the page
-- answered "The candidate profile could not be loaded."
--
-- The length ceiling matches the slice the server action applies to the
-- submitted field (100_000 characters), so a fitting form value can never be
-- rejected by the check constraint.
alter table public.candidate_profiles
  add column cv_full_text text
    check (cv_full_text is null or char_length(cv_full_text) <= 100000);

grant insert (cv_full_text), update (cv_full_text)
  on public.candidate_profiles to authenticated;
