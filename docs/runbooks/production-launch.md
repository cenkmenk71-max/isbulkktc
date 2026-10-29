# Runbook: Vercel + hosted Supabase production launch

This runbook targets `https://isbulkktc.com`. Local Supabase is for development
and tests only. Do not copy local keys, service-role keys, access tokens,
database passwords, or candidate/company data into chat, source control, or
client-visible environment variables.

## 1. Prepare isolated production services

1. Create a dedicated hosted Supabase production project. Do not reuse the local
   project or a preview/staging database.
2. Connect the GitHub repository to a Vercel project. Keep Preview and
   Production environment variables separate.
3. Add `isbulkktc.com` to the Vercel project and follow the current DNS records
   Vercel shows for the domain. Configure Cloudflare from those values; do not
   guess old IP/CNAME targets. Choose one canonical host and make the other
   host redirect to it.
4. Configure only these application environment variables in Vercel Production:
   - `NEXT_PUBLIC_SUPABASE_URL`: hosted project's URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its publishable/anon client key.
   - `NEXT_PUBLIC_APP_URL`: `https://isbulkktc.com` (or the explicitly chosen
     canonical host).
5. Never set a Supabase `service_role`/secret key as `NEXT_PUBLIC_*`; the app
   does not require one for normal server-side requests.
6. In Supabase Auth URL configuration, set the Site URL to the canonical HTTPS
   origin and allow `https://isbulkktc.com/auth/callback`. Add the canonical
   `www` callback only if `www` remains a supported host. Configure the actual
   Vercel Preview callback separately in a non-production Supabase project,
   not in Production.
7. Configure and test production email delivery and verification templates
   before inviting real users. Do not assume local Auth email delivery behaves
   like hosted Auth.

## 2. Apply database migrations safely

Use the project-pinned Supabase CLI from a developer terminal where credentials
remain local. Authenticate through the CLI's own interactive flow; do not send
personal access tokens or database passwords to chat.

```powershell
npm exec -- supabase login
npm exec -- supabase projects list
npm exec -- supabase link --project-ref <production-project-ref>
npm exec -- supabase migration list
npm exec -- supabase db push --dry-run
```

Stop if the linked project ref is not the intended Production project, if
migration history diverges unexpectedly, or if the dry run includes an
unreviewed migration. After reviewing the exact output and taking the planned
backup, apply only pending migrations:

```powershell
npm exec -- supabase db push
npm exec -- supabase migration list
```

Never use `db reset` against a hosted project. Do not run production migrations
from this agent session until the owner explicitly identifies and authorizes
the target project.

## 3. Bootstrap the first administrator and enforce MFA

1. Deploy the application after the database migrations are applied.
2. Create the intended operator's account through the production registration
   flow and verify its email. Record the account UUID from the trusted Supabase
   dashboard.
3. Confirm the operator, account UUID and Production project ref out-of-band.
   In Supabase Dashboard SQL Editor, review
   [`../../supabase/operations/bootstrap-platform-admin.sql`](../../supabase/operations/bootstrap-platform-admin.sql),
   replace only its zero UUID placeholder with the verified account UUID and
   execute once. Record the operator, approval and timestamp in the
   organization-controlled audit location.
4. Sign in at `https://isbulkktc.com/admin/packages`, enroll a TOTP
   authenticator, and verify its six-digit code. Store recovery access in the
   organization's approved password manager; the application does not retain
   the TOTP secret.
5. Confirm non-admin and AAL1 sessions cannot view package management,
   company review data, or call admin RPCs. Confirm the MFA-verified admin can
   create a package, assign it to a verified company and see the resulting
   entitlement before enabling real job publication.

The SQL bootstrap script is intentionally one-time and refuses to run when an
admin already exists. It does not provide a public role-granting endpoint.
Additional administrator provisioning needs a separately reviewed, audited
operator process.

## 4. Configure application notification delivery

Application notifications are written to the in-app feed regardless of email
configuration. The email worker is inactive until these production steps are
completed. Do not paste secrets into SQL, source control, chat, or Vercel
environment variables.

1. Verify a sending domain in Resend and choose an owner-approved sender address.
2. In the hosted Supabase project's Edge Function secrets, configure:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `APP_URL` (the canonical HTTPS app origin)
   - `NOTIFICATION_WORKER_TOKEN`: a dedicated random value (e.g.
     `openssl rand -hex 32`). The worker compares the inbound bearer against it.
     Do **not** rely on `SUPABASE_SERVICE_ROLE_KEY` for this comparison: Supabase
     injects that value and the Management API will not return it, so it cannot
     be stored in Vault for the cron job to send. The worker falls back to it only
     when `NOTIFICATION_WORKER_TOKEN` is unset.
   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge
   Functions. Never put the service-role key in Vercel or a `NEXT_PUBLIC_*`
   variable.
3. Deploy from the repository using the project-pinned CLI:

   ```powershell
   npm exec -- supabase functions deploy send-application-notifications --project-ref <production-project-ref>
   ```

   `verify_jwt` is disabled at the gateway for this function because it checks
   the exact service-role bearer value itself. Do not remove that in-function
   check or expose the worker endpoint without it.
4. In Supabase Database > Extensions, enable `pg_cron`, `pg_net`, and Vault if
   they are not already enabled. In Vault, store:
   - `application_notification_function_url`: the project's Edge Function URL
   - `application_notification_apikey`: the project's publishable key
   - `application_notification_worker_token`: the same value as
     `NOTIFICATION_WORKER_TOKEN`, used only as the function's bearer token
5. In the SQL Editor, schedule the worker once per minute. This SQL contains
   only Vault lookups, not secret values:

   ```sql
   select cron.schedule(
     'send-application-notifications',
     '* * * * *',
     $job$
     select net.http_post(
       url := (
         select decrypted_secret
         from vault.decrypted_secrets
         where name = 'application_notification_function_url'
       ),
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'apikey', (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'application_notification_apikey'
         ),
         'Authorization', 'Bearer ' || (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'application_notification_worker_token'
         )
       ),
       body := '{"_batch_size":20}'::jsonb
     );
     $job$
   );
   ```

6. Confirm scheduled executions in `cron.job_run_details` and monitor the
   email outbox for pending/retried items. Claiming is limited to active
   profiles with confirmed, non-empty email addresses. The in-app feed remains
   the source of truth if email delivery is unavailable.
7. Use synthetic accounts and a non-production project for a smoke test. Verify
   one submission, first-view, and status-change notification in both the
   in-app feed and intended test mailbox before enabling the production
   schedule.

The worker retries transient failures with backoff. Resend idempotency keys
reduce duplicate sends during retries but expire after 24 hours; email delivery
is therefore best-effort and not an exactly-once guarantee. A successful Resend
API response confirms provider acceptance, not inbox placement or that the
recipient read the email.

To pause the schedule, find its job ID in `cron.job` and run
`select cron.unschedule(<job-id>);`. Do not delete queued notification records.

## 5. Configure authentication and account email

`supabase/config.toml` describes the local stack only. Reproduce these settings
in the hosted project's Auth dashboard; a local `config.toml` change does not
reach production.

1. In Auth > Providers, keep Email enabled and turn on **Confirm email**. The
   local stack already requires a verified mailbox before sign-in, and the
   sign-in action expects the resulting `email_not_confirmed` code.
2. Set **Minimum password length** to 8 to match `updatePasswordSchema` and
   `signUpSchema`. Leave character-class rules off; prefer Supabase's
   **leaked password protection** (HaveIBeenPwned) instead, which the local
   config intentionally does not attempt to emulate.
3. Under Auth > Rate Limits, set the email send limit to a production-appropriate
   value. The local stack uses 30/hour as a development default; the hosted
   free plan's own limits apply on top and may be lower.
4. Under Auth > Email Templates, replace each built-in template with the
   repository versions in `supabase/templates/` (`confirmation.html`,
   `recovery.html`, `reauthentication.html`, `password-changed.html`). Copy the
   HTML and subject from those files, and confirm the `{{ .ConfirmationURL }}`,
   `{{ .Token }}`, `{{ .Email }}`, and `{{ .SiteURL }}` variables survive the
   paste.
5. Configure custom SMTP so sign-up, recovery, and password-changed mail is not
   limited by Supabase's shared sender. Resend works here: use the verified
   sending domain and an SMTP credential, and never put the API key in a
   `NEXT_PUBLIC_*` variable.
6. Walk the full lifecycle once with a synthetic account on a non-production
   project: register, confirm, sign in, request a reset, set a new password,
   confirm the password-changed notice arrives, and verify the old password no
   longer works. Then repeat the sign-in and reset checks on the live domain.

Password recovery is enabled in the application; the `/forgot-password` page
renders a working form. Do not reintroduce a placeholder that hides the form
while SMTP is unconfigured — an unconfigured sender should fail loudly in the
reset action, not silently disable the feature.

## 6. Production release checks

- Confirm the Vercel Production deployment uses the correct domain and
  Production environment variables, not Preview/local values.
- Confirm HTTPS, canonical URLs, sitemap/robots, email verification callback,
  login/logout and password recovery on the live domain.
- Confirm migrations are current; run authorization tests against a dedicated
  hosted staging project before production when one is available.
- Confirm the package catalog contains only owner-approved entitlements.
  Package names, job limits, durations and assignment periods must be supplied
  by the product owner; this repository intentionally seeds none.
- Keep real job publication closed until verified company review, package
  assignment, admin MFA, application flow, rate limits, monitoring, backup and
  restore gates are operationally accepted.
- Do not describe a successful local `test:db` as a production database test.
