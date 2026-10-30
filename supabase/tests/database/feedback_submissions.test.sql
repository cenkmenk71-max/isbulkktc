begin;

select plan(6);

-- `submit_feedback` must survive a stale session: a JWT can outlive the profile
-- row it points at (account deleted, session revoked), and `auth.uid()` then
-- resolves to a uuid with no `profiles` row. The submission must still store the
-- message with a null author rather than fail the visitor with a foreign-key
-- error. Everything here rolls back with the transaction.
--
-- `feedback_submissions` is readable by the service role only, so the
-- assertions read it back after `reset role`; the submissions themselves are
-- issued as the visitor would (anon, then an authenticated stale session).

-- Anonymous visitor: no author at all.
set local role anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';

select lives_ok(
  $$select public.submit_feedback(
      'Anonymous Visitor',
      'anon-feedback@example.test',
      'general',
      4,
      'Anonymous feedback should be stored with a null author.',
      'tr'
    )$$,
  'an anonymous visitor can submit feedback'
);

reset role;
select is(
  (select count(*)::integer
   from public.feedback_submissions
   where email = 'anon-feedback@example.test'),
  1,
  'the anonymous submission is stored'
);

select is(
  (select user_id
   from public.feedback_submissions
   where email = 'anon-feedback@example.test'),
  null,
  'anonymous feedback is stored with a null author'
);

-- Stale session: an authenticated JWT whose user has no profile row.
select is(
  (select count(*)::integer from public.profiles
   where id = '84000000-0000-4000-8000-0000000000ff'),
  0,
  'the stale session has no matching profile row'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"role":"authenticated","sub":"84000000-0000-4000-8000-0000000000ff","iss":"supabase"}';

select lives_ok(
  $$select public.submit_feedback(
      'Stale Session',
      'stale-feedback@example.test',
      'bug',
      2,
      'Feedback from a session whose profile no longer exists.',
      'en'
    )$$,
  'a stale session can still submit feedback'
);

reset role;
select is(
  (select user_id
   from public.feedback_submissions
   where email = 'stale-feedback@example.test'),
  null,
  'stale-session feedback is stored with a null author instead of failing'
);

select * from finish();
rollback;
