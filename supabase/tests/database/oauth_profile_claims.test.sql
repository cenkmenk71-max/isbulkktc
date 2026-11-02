begin;

-- Google does not send `given_name` / `family_name`; it sends `name` and
-- `full_name`. Before 20261031150000_v4_oauth_derived_names.sql the claims
-- reader left the pair null for every Google account, so the account card
-- rendered a name next to two empty first/last fields. These assertions pin the
-- derivation, the provider-precedence rule and the single-token edge case.

select plan(7);

-- A Google payload: only the combined name is present.
select is(
  (
    select given_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz","picture":"https://example.test/a.jpg"}'::jsonb
    )
  ),
  'Ayşe',
  'given_name is derived from the first token of a Google full_name'
);

select is(
  (
    select family_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz"}'::jsonb
    )
  ),
  'Yılmaz',
  'family_name is derived from the remainder of a Google full_name'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims(
      '{"name":"Ayşe Yılmaz","full_name":"Ayşe Yılmaz"}'::jsonb
    )
  ),
  'Ayşe Yılmaz',
  'the combined display name is unchanged'
);

-- A LinkedIn payload already carries the pair; it must win over the split.
select is(
  (
    select given_name
    from public.oauth_profile_claims(
      '{"name":"Yılmaz, Ayşe","given_name":"Ayşe","family_name":"Yılmaz"}'::jsonb
    )
  ),
  'Ayşe',
  'an explicit provider given_name wins over the derived one'
);

select is(
  (
    select family_name
    from public.oauth_profile_claims(
      '{"name":"Yılmaz, Ayşe","given_name":"Ayşe","family_name":"Yılmaz"}'::jsonb
    )
  ),
  'Yılmaz',
  'an explicit provider family_name wins over the derived one'
);

-- A mononym has no family name; an empty string would violate the column CHECK
-- for a value the candidate never typed, so it must stay null.
select is(
  (
    select family_name
    from public.oauth_profile_claims('{"full_name":"Madonna"}'::jsonb)
  ),
  null,
  'a single-token name yields a null family name, never an empty string'
);

select is(
  (
    select display_name
    from public.oauth_profile_claims('{}'::jsonb)
  ),
  null,
  'an empty provider payload yields no display name'
);

select * from finish();

rollback;
