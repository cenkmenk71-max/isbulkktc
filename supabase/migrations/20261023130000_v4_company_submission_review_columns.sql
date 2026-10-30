-- 20261014120000 granted INSERT and UPDATE on company_profile_submissions at the
-- *table* level, then also listed the intended columns. A table-level grant covers
-- every column, so the column lists did nothing: a company owner could insert a row
-- already marked `status = 'approved'` with a forged `review_note` / `reviewed_by`,
-- bypassing review_company_profile_submission and the pending-only update policy
-- (which only guards UPDATE, not INSERT).
--
-- Revoke the table-level grant and re-assert the column lists so INSERT can only ever
-- produce a `pending` row (the column default) and cannot touch the review columns.
-- `id`, `created_at`, `updated_at` stay default-only, as the original migration meant.
revoke insert, update on table public.company_profile_submissions
  from authenticated;

grant insert (
  company_id,
  submitted_by,
  company_name,
  profile_description,
  categories,
  website,
  phone,
  public_email,
  address,
  municipality,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;

grant update (
  company_name,
  profile_description,
  categories,
  website,
  phone,
  public_email,
  address,
  municipality,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;
