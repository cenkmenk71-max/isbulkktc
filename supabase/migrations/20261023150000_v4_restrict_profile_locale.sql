-- `public.profiles.locale` accepted a seventh value, `'he'`, that the product
-- never shipped: the i18n routing (`src/i18n/routing.ts`), the message catalogues
-- and the auth e-mail templates all cover exactly `tr, en, ru, el, fa, de`. A
-- signed-in candidate can update their own `locale` column, so the extra value
-- was reachable through PostgREST and could leave a profile the app cannot
-- render. The sign-up trigger already normalises anything outside the six to
-- `tr`; this closes the same gap at the storage layer.
--
-- Any pre-existing `'he'` row is normalised before the narrower check is
-- validated, so the constraint applies to the whole table rather than only to
-- new writes.
update public.profiles
  set locale = 'tr'
  where locale not in ('tr', 'en', 'ru', 'el', 'fa', 'de');

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de'));
