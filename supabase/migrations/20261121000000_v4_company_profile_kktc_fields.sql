-- Add KKTC-specific company profile fields to companies, company_profile_submissions,
-- and company_directory_overrides tables.
--
-- New columns cover: trade title, company type, tax number, trade registry number,
-- MERSIS, establishment date, capital, currency, registered district/municipality/
-- postal code, workplace address/district/municipality/postal code, fax, authorized
-- signatories, NACE code, sector, sub-sector, keywords, bank name, IBAN, insurance
-- number, employee count, annual turnover range, and social media links.

-- Helper: validate that a text[] contains only non-null strings each <= max_len chars
create or replace function public.is_valid_string_array(arr text[], max_len integer)
returns boolean language plpgsql as $$
declare
  i integer;
begin
  if arr is null then
    return true;
  end if;
  for i in 1..cardinality(arr) loop
    if arr[i] is null or char_length(arr[i]) > max_len then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.companies
  add column trade_title text
    check (trade_title is null or char_length(trade_title) <= 120),
  add column company_type text
    check (
      company_type is null
      or company_type in ('LTD', 'ANONIM', 'KOLLEKTIF', 'KOMANDIT', 'SAHIS')
    ),
  add column tax_number text
    check (
      tax_number is null
      or (
        char_length(tax_number) = 10
        and tax_number ~ '^[0-9]{10}$'
      )
    ),
  add column trade_registry_number text
    check (trade_registry_number is null or char_length(trade_registry_number) <= 60),
  add column mersis_no text
    check (
      mersis_no is null
      or (
        char_length(mersis_no) = 16
        and mersis_no ~ '^[0-9]{16}$'
      )
    ),
  add column establishment_date date
    check (establishment_date is null or establishment_date <= current_date),
  add column capital numeric
    check (capital is null or capital >= 0),
  add column currency text default 'TRY'
    check (
      currency is null
      or (char_length(currency) = 3 and currency ~ '^[A-Z]{3}$')
    ),
  add column registered_district text
    check (
      registered_district is null
      or registered_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column registered_municipality text
    check (registered_municipality is null or char_length(registered_municipality) <= 120),
  add column registered_postal_code text
    check (
      registered_postal_code is null
      or (
        char_length(registered_postal_code) = 5
        and registered_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column workplace_address text
    check (workplace_address is null or char_length(workplace_address) <= 500),
  add column workplace_district text
    check (
      workplace_district is null
      or workplace_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column workplace_municipality text
    check (workplace_municipality is null or char_length(workplace_municipality) <= 120),
  add column workplace_postal_code text
    check (
      workplace_postal_code is null
      or (
        char_length(workplace_postal_code) = 5
        and workplace_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column fax text
    check (fax is null or char_length(fax) <= 80),
  add column authorized_signatories jsonb
    check (
      authorized_signatories is null
      or jsonb_typeof(authorized_signatories) = 'array'
    ),
  add column nace_code text
    check (nace_code is null or char_length(nace_code) <= 4),
  add column sector text
    check (sector is null or char_length(sector) <= 80),
  add column sub_sector text
    check (sub_sector is null or char_length(sub_sector) <= 80),
  add column keywords text[]
    check (
      keywords is null
      or (
        cardinality(keywords) <= 20
        and public.is_valid_string_array(keywords, 60)
      )
    ),
  add column bank_name text
    check (bank_name is null or char_length(bank_name) <= 120),
  add column iban text
    check (
      iban is null
      or (
        char_length(iban) <= 30
        and iban ~* '^TR[0-9]{2}[A-Z0-9]{4}[0-9]{4}[0-9]{4}[0-9]{4}[0-9]{2}$'
      )
    ),
  add column insurance_number text
    check (insurance_number is null or char_length(insurance_number) <= 60),
  add column employee_count integer
    check (employee_count is null or employee_count >= 0),
  add column annual_turnover_range text
    check (
      annual_turnover_range is null
      or annual_turnover_range in (
        '0-500K', '500K-1M', '1M-5M', '5M-10M', '10M-50M', '50M+'
      )
    ),
  add column linked_in text
    check (
      linked_in is null
      or (
        char_length(linked_in) <= 2048
        and linked_in ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column instagram text
    check (
      instagram is null
      or (
        char_length(instagram) <= 2048
        and instagram ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column facebook text
    check (
      facebook is null
      or (
        char_length(facebook) <= 2048
        and facebook ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column twitter text
    check (
      twitter is null
      or (
        char_length(twitter) <= 2048
        and twitter ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column youtube text
    check (
      youtube is null
      or (
        char_length(youtube) <= 2048
        and youtube ~* '^https?://[^[:space:]]+$'
      )
    );

alter table public.company_profile_submissions
  add column trade_title text
    check (trade_title is null or char_length(trade_title) <= 120),
  add column company_type text
    check (
      company_type is null
      or company_type in ('LTD', 'ANONIM', 'KOLLEKTIF', 'KOMANDIT', 'SAHIS')
    ),
  add column tax_number text
    check (
      tax_number is null
      or (
        char_length(tax_number) = 10
        and tax_number ~ '^[0-9]{10}$'
      )
    ),
  add column trade_registry_number text
    check (trade_registry_number is null or char_length(trade_registry_number) <= 60),
  add column mersis_no text
    check (
      mersis_no is null
      or (
        char_length(mersis_no) = 16
        and mersis_no ~ '^[0-9]{16}$'
      )
    ),
  add column establishment_date date
    check (establishment_date is null or establishment_date <= current_date),
  add column capital numeric
    check (capital is null or capital >= 0),
  add column currency text default 'TRY'
    check (
      currency is null
      or (char_length(currency) = 3 and currency ~ '^[A-Z]{3}$')
    ),
  add column registered_district text
    check (
      registered_district is null
      or registered_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column registered_municipality text
    check (registered_municipality is null or char_length(registered_municipality) <= 120),
  add column registered_postal_code text
    check (
      registered_postal_code is null
      or (
        char_length(registered_postal_code) = 5
        and registered_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column workplace_address text
    check (workplace_address is null or char_length(workplace_address) <= 500),
  add column workplace_district text
    check (
      workplace_district is null
      or workplace_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column workplace_municipality text
    check (workplace_municipality is null or char_length(workplace_municipality) <= 120),
  add column workplace_postal_code text
    check (
      workplace_postal_code is null
      or (
        char_length(workplace_postal_code) = 5
        and workplace_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column fax text
    check (fax is null or char_length(fax) <= 80),
  add column authorized_signatories jsonb
    check (
      authorized_signatories is null
      or jsonb_typeof(authorized_signatories) = 'array'
    ),
  add column nace_code text
    check (nace_code is null or char_length(nace_code) <= 4),
  add column sector text
    check (sector is null or char_length(sector) <= 80),
  add column sub_sector text
    check (sub_sector is null or char_length(sub_sector) <= 80),
  add column keywords text[]
    check (
      keywords is null
      or (
        cardinality(keywords) <= 20
        and public.is_valid_string_array(keywords, 60)
      )
    ),
  add column bank_name text
    check (bank_name is null or char_length(bank_name) <= 120),
  add column iban text
    check (
      iban is null
      or (
        char_length(iban) <= 30
        and iban ~* '^TR[0-9]{2}[A-Z0-9]{4}[0-9]{4}[0-9]{4}[0-9]{4}[0-9]{2}$'
      )
    ),
  add column insurance_number text
    check (insurance_number is null or char_length(insurance_number) <= 60),
  add column employee_count integer
    check (employee_count is null or employee_count >= 0),
  add column annual_turnover_range text
    check (
      annual_turnover_range is null
      or annual_turnover_range in (
        '0-500K', '500K-1M', '1M-5M', '5M-10M', '10M-50M', '50M+'
      )
    ),
  add column linked_in text
    check (
      linked_in is null
      or (
        char_length(linked_in) <= 2048
        and linked_in ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column instagram text
    check (
      instagram is null
      or (
        char_length(instagram) <= 2048
        and instagram ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column facebook text
    check (
      facebook is null
      or (
        char_length(facebook) <= 2048
        and facebook ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column twitter text
    check (
      twitter is null
      or (
        char_length(twitter) <= 2048
        and twitter ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column youtube text
    check (
      youtube is null
      or (
        char_length(youtube) <= 2048
        and youtube ~* '^https?://[^[:space:]]+$'
      )
    );

alter table public.company_directory_overrides
  add column trade_title text
    check (trade_title is null or char_length(trade_title) <= 120),
  add column company_type text
    check (
      company_type is null
      or company_type in ('LTD', 'ANONIM', 'KOLLEKTIF', 'KOMANDIT', 'SAHIS')
    ),
  add column tax_number text
    check (
      tax_number is null
      or (
        char_length(tax_number) = 10
        and tax_number ~ '^[0-9]{10}$'
      )
    ),
  add column trade_registry_number text
    check (trade_registry_number is null or char_length(trade_registry_number) <= 60),
  add column mersis_no text
    check (
      mersis_no is null
      or (
        char_length(mersis_no) = 16
        and mersis_no ~ '^[0-9]{16}$'
      )
    ),
  add column establishment_date date
    check (establishment_date is null or establishment_date <= current_date),
  add column capital numeric
    check (capital is null or capital >= 0),
  add column currency text default 'TRY'
    check (
      currency is null
      or (char_length(currency) = 3 and currency ~ '^[A-Z]{3}$')
    ),
  add column registered_district text
    check (
      registered_district is null
      or registered_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column registered_municipality text
    check (registered_municipality is null or char_length(registered_municipality) <= 120),
  add column registered_postal_code text
    check (
      registered_postal_code is null
      or (
        char_length(registered_postal_code) = 5
        and registered_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column workplace_address text
    check (workplace_address is null or char_length(workplace_address) <= 500),
  add column workplace_district text
    check (
      workplace_district is null
      or workplace_district in (
        'Lefkoşa', 'Mağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke'
      )
    ),
  add column workplace_municipality text
    check (workplace_municipality is null or char_length(workplace_municipality) <= 120),
  add column workplace_postal_code text
    check (
      workplace_postal_code is null
      or (
        char_length(workplace_postal_code) = 5
        and workplace_postal_code ~ '^[0-9]{5}$'
      )
    ),
  add column fax text
    check (fax is null or char_length(fax) <= 80),
  add column authorized_signatories jsonb
    check (
      authorized_signatories is null
      or jsonb_typeof(authorized_signatories) = 'array'
    ),
  add column nace_code text
    check (nace_code is null or char_length(nace_code) <= 4),
  add column sector text
    check (sector is null or char_length(sector) <= 80),
  add column sub_sector text
    check (sub_sector is null or char_length(sub_sector) <= 80),
  add column keywords text[]
    check (
      keywords is null
      or (
        cardinality(keywords) <= 20
        and public.is_valid_string_array(keywords, 60)
      )
    ),
  add column bank_name text
    check (bank_name is null or char_length(bank_name) <= 120),
  add column iban text
    check (
      iban is null
      or (
        char_length(iban) <= 30
        and iban ~* '^TR[0-9]{2}[A-Z0-9]{4}[0-9]{4}[0-9]{4}[0-9]{4}[0-9]{2}$'
      )
    ),
  add column insurance_number text
    check (insurance_number is null or char_length(insurance_number) <= 60),
  add column employee_count integer
    check (employee_count is null or employee_count >= 0),
  add column annual_turnover_range text
    check (
      annual_turnover_range is null
      or annual_turnover_range in (
        '0-500K', '500K-1M', '1M-5M', '5M-10M', '10M-50M', '50M+'
      )
    ),
  add column linked_in text
    check (
      linked_in is null
      or (
        char_length(linked_in) <= 2048
        and linked_in ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column instagram text
    check (
      instagram is null
      or (
        char_length(instagram) <= 2048
        and instagram ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column facebook text
    check (
      facebook is null
      or (
        char_length(facebook) <= 2048
        and facebook ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column twitter text
    check (
      twitter is null
      or (
        char_length(twitter) <= 2048
        and twitter ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column youtube text
    check (
      youtube is null
      or (
        char_length(youtube) <= 2048
        and youtube ~* '^https?://[^[:space:]]+$'
      )
    );

-- Grant INSERT/UPDATE on new columns for company_profile_submissions
revoke insert, update on table public.company_profile_submissions
  from authenticated;

grant insert (
  company_id,
  submitted_by,
  company_name,
  trade_title,
  company_type,
  tax_number,
  trade_registry_number,
  mersis_no,
  establishment_date,
  capital,
  currency,
  profile_description,
  categories,
  registered_address,
  registered_district,
  registered_municipality,
  registered_postal_code,
  workplace_address,
  workplace_district,
  workplace_municipality,
  workplace_postal_code,
  phone,
  fax,
  email,
  website,
  authorized_signatories,
  nace_code,
  sector,
  sub_sector,
  keywords,
  bank_name,
  iban,
  insurance_number,
  employee_count,
  annual_turnover_range,
  linked_in,
  instagram,
  facebook,
  twitter,
  youtube,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;

grant update (
  company_name,
  trade_title,
  company_type,
  tax_number,
  trade_registry_number,
  mersis_no,
  establishment_date,
  capital,
  currency,
  profile_description,
  categories,
  registered_address,
  registered_district,
  registered_municipality,
  registered_postal_code,
  workplace_address,
  workplace_district,
  workplace_municipality,
  workplace_postal_code,
  phone,
  fax,
  email,
  website,
  authorized_signatories,
  nace_code,
  sector,
  sub_sector,
  keywords,
  bank_name,
  iban,
  insurance_number,
  employee_count,
  annual_turnover_range,
  linked_in,
  instagram,
  facebook,
  twitter,
  youtube,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;
