# Plan: Job Application Flow — Fix + Professionalize

**Goal:** Make the candidate journey from job listing → apply → employer receipt → notification → status tracking flawless and fully functional. Fix the reported 404 on registration buttons, add CV/resume attachment with employer download, guarantee notifications reach both employer and candidate, and wire up Vercel Cron-based delivery.

**Location:** `D:\isbulkktc`
**Plan file:** `.kilo/plans/1795874104000-job-application-flow.md`

---

## Current state (verified by code inspection)

### Flow that already works
- `GET /[locale]/jobs/[slug]` → `getPublicJobBySlug` RPC → `JobDetailExperience` → `JobApplicationForm` (only for `publication_source = 'platform'` jobs).
- Unauthenticated visitor sees CTA card with sign-in/sign-up links carrying `?next=` back to the job.
- Authenticated candidate with a `candidate_profiles` row submits cover letter via `applyToJob` server action → `apply_to_job` RPC.
- RPC validates active user + candidate profile, job published/unexpired/verified company, unique `(job_id, candidate_id)` (no duplicates), optional contact-email share (requires confirmed email), inserts `applications`, `application_events` ('submitted'), `audit_logs`, enqueues notifications to candidate + all active company members (owner/recruiter).
- Candidate dashboard `/profile/dashboard` lists my applications via `list_my_applications` RPC (status, submitted_at, first_viewed_at, link to job).
- Company dashboard `/company/dashboard` lists applications; detail page `/company/dashboard/applications/[id]` shows candidate name, shared contact email, cover letter, status transition form.
- `transition_application` RPC handles submitted→reviewing/shortlisted/rejected→hired/rejected, creates `status_changed` event, notifies candidate, audit log.
- Notifications: `notifications` table + `notification_email_outbox` (sent by Supabase edge function `send-application-notifications` via Resend), push via `/api/push/dispatch` (VAPID, needs `PUSH_CRON_SECRET`).
- RLS: `applications`, `notifications`, `notification_email_outbox` all revoked from public/anon/authenticated; grants via RPCs only.

### Confirmed defects
1. **404 on registration buttons** — `src/components/jobs/job-application-form.tsx:36-37` links to `/sign-up` and `/sign-in`, but the actual routes are `/register` and `/login` (`src/app\[locale]\(auth)\register\page.tsx`, `login\page.tsx`). Every unauthenticated candidate clicking "kayıt ol"/"giriş yap" hits a 404. This is the reported "en son 404 veriyordu."
2. **No CV/resume attached to applications** — `apply_to_job` RPC and `public.applications` store only `cover_letter`. A separate `resumes` table exists (PDF only, statuses: uploaded/processing/parsed/failed/deleted) but is never linked to an application. Employer cannot see/download the candidate's CV from the application detail. **No resume download route exists anywhere in the app.**
3. **No cron scheduled for notification delivery** — `vercel.json` has no cron. The `send-application-notifications` edge function and `/api/push/dispatch` exist but nothing triggers them on a schedule, so application-received emails/pushes may never be delivered.
4. **Post-apply UX** — After a successful apply, the candidate stays on the job page with an inline success message; no confirmation screen or dashboard redirect.

---

## Design decisions (resolved)

| Decision | Value | Rationale |
|---|---|---|
| Registration link URLs | `/register`, `/login` | Match existing routes; fixes 404 |
| CV attachment | Optional `resume_id` on `applications` | Candidate selects from their registered resumes; employer sees link on application detail |
| Resume status filter | Only `status = 'parsed'` attachable | Ensures CV is processed and readable; excludes upload/failed/deleted |
| CV download route | `GET /api/resumes/[id]/download` (proxy) | Server-side proxies file from storage; authorization: resume owner (candidate) or active company member (owner/recruiter) of the job's company |
| Cron mechanism | Vercel Cron | App deploys on Vercel; push dispatch is already a Route Handler |
| Cron wrapper for edge function | `src/app/api/cron/send-application-notifications/route.ts` | Vercel Cron hits Next.js routes, not Supabase edge functions directly; wrapper calls the edge function with service role |
| Apply success UX | Inline success + confirmation card + dashboard link | Low friction, keeps context |
| Duplicate applications | Blocked by DB unique constraint + `23505` → "duplicate" message | Already implemented; keep |
| Source-site jobs | No apply form; external link only | Already implemented; keep (imported listings can't be applied to on-platform) |

---

## Tasks

### 1. Fix 404 registration links
**File:** `src/components/jobs/job-application-form.tsx`
- Change `signUpHref` from `${prefix}/sign-up` to `${prefix}/register`
- Change `signInHref` from `${prefix}/sign-in` to `${prefix}/login`
- Verify the `next=` param still round-trips to the job page after auth

### 2. Add CV/resume attachment to applications
**Database (new migration `supabase/migrations/YYYYMMDDHHMMSS_v4_application_resume_attachment.sql` — do NOT edit existing applied migrations):**
- Add column `resume_id uuid references public.resumes (id) on delete set null` to `public.applications`
- No new RLS policies needed on `applications` (already revoked from public/anon/authenticated; RPC-mediated writes only)
- In the same new migration, modify the existing 3-param plpgsql function `public.apply_to_job(_job_id uuid, _cover_letter text, _share_contact_email boolean)` to add a 4th param `_resume_id uuid default null`.
  - If `_resume_id` is provided, verify `resumes.candidate_id = v_actor` and `resumes.status = 'parsed'`; raise `22023` otherwise.
  - Store `resume_id` on the inserted application row.
  - Do NOT add a separate 4-param overload (PostgreSQL positional binding would be ambiguous with the existing 3-param calls).
- The existing 2-param SQL wrapper `apply_to_job(_job_id, _cover_letter text default '')` calls the 3-param with `false` for `_share_contact_email`; `_resume_id` defaults to null, so it keeps working unchanged.

**Server action (`applyToJob` in `src/features/jobs/actions.ts`):**
- Extend `applyToJobSchema` with optional `resumeId: z.string().uuid().nullable()`
- Pass `resumeId` to the RPC

**Application form (`JobApplicationForm`):**
- When authenticated, fetch candidate's resumes via `listMyResumes()` (server component or server action)
- Filter to `status = 'parsed'` resumes
- Render an optional resume select dropdown; show "no resumes registered" hint linking to candidate dashboard/profile if none
- On success, show the selected resume filename in the success state

### 3. Add CV download route
**New file:** `src/app/api/resumes/[id]/download/route.ts`
- `GET` route, `export const dynamic = 'force-dynamic'`, `Cache-Control: no-store`
- Read `resumes` row by id; 404 if not found or status = 'deleted'
- Authorization:
  - Candidate: `resumes.candidate_id === auth.uid()` AND `status != 'deleted'` → allow.
  - Employer: allow only if the resume is attached to an application for one of the requester's company's jobs:
    `SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id JOIN public.company_members cm ON cm.company_id = j.company_id WHERE a.resume_id = $1 AND cm.user_id = auth.uid() AND cm.status = 'active' AND cm.membership_role IN ('owner', 'recruiter')`.
  - Otherwise 403.
- Return file from storage (signed URL or proxy). Use Supabase storage signed URL with short expiry, or proxy bytes server-side.
- Add `export const revalidate = 0` if needed

**Company application detail (`src/app\[locale]\(company)\company\dashboard\applications\[applicationId]\page.tsx`):**
- Fetch resume metadata via new DAL function `getApplicationResume(applicationId)` returning `{ id, original_filename, storage_path }`
- Render a download link to `/api/resumes/[id]/download` when `resume_id` is present

**DAL (`src/server/dal/resumes.ts` or `jobs.ts`):**
- Add `getApplicationResume(applicationId)` returning `{ id, original_filename, storage_path }` — server-side only, used by the download route to fetch the file. Storage path is never returned to the client; the route proxies/signed-URLs it.

### 4. Configure Vercel Cron for notification delivery
**File:** `vercel.json`
- Add cron entry: `/api/push/dispatch` → every minute, `Authorization: Bearer $PUSH_CRON_SECRET`
- Add cron entry: `/api/cron/send-application-notifications` → every minute, `Authorization: Bearer $NOTIFICATION_CRON_SECRET`
- Ensure `PUSH_CRON_SECRET`, `NOTIFICATION_CRON_SECRET`, `RESEND_API_KEY` are set in Vercel project env

**New file:** `src/app/api/cron/send-application-notifications/route.ts`
- `POST` route, `export const dynamic = 'force-dynamic'`
- Verify `Authorization: Bearer $NOTIFICATION_CRON_SECRET`
- Call the Supabase edge function `send-application-notifications` (via `fetch` to its URL with service role key)
- Return JSON summary

### 5. Post-apply confirmation UX
**File:** `src/components/jobs/job-application-form.tsx`
- On `state.status === "success"`, render a confirmation card: application received, job title, application ID, what happens next (employer review, status updates via email/push), link to candidate dashboard `/profile/dashboard#my-applications`
- Keep existing inline message as fallback

### 6. Tests
**Unit (`tests/unit/`):**
- `applyToJob` action: unauthorized, invalid profile, duplicate (23505), unverified contact email, success with/without resume
- `job-application-form`: hrefs point to `/register` and `/login` (not `/sign-up`/`/sign-in`), resume select renders
- `transitionApplication`: employer-only transitions, candidate withdraw, invalid transitions

**E2E (`tests/e2e/`):**
- Anonymous visitor clicks "kayıt ol" on a job → lands on `/register`, not 404
- Anonymous visitor clicks "giriş yap" → lands on `/login`, not 404
- Register → confirm email → create candidate profile → register a resume → apply to job → see success → see application in dashboard
- Employer logs in → sees application in dashboard → opens detail → sees candidate name + CV download link → downloads CV → changes status → candidate gets notification

**Database (pgTAP `supabase/tests/database/`):**
- `apply_to_job` accepts optional resume_id; validates resume ownership and status = 'parsed'
- Notification enqueued to candidate + company members on submit
- Notification enqueued to candidate on status change

### 7. Verification
Run in order (per AGENTS.md):
- `bun run lint`
- `bun run typecheck`
- `bun run check:frontend-source`
- `bun run test:unit`
- `bun run test:integration`
- `bun run build` (with `NEXT_DIST_DIR=.next-<name>` to keep tree clean)
- `bun run test:e2e` (Playwright shards against `.next/standalone/server.js`)

---

## Open risks / out of scope

- **Email template content for application notifications** — the edge function renders from `supabase/functions/_shared/email-copy.ts`. Verify the application-notification template exists and is localized; if not, add it. Out of scope for this plan unless the send test shows missing copy.
- **Push subscription** — candidate must enable push permissions via `PushPermissionControl` on the dashboard; push won't deliver without a subscription. Documented behavior, not a bug.
- **Source-site (imported) jobs** — remain externally linked; no on-platform application. Intended.
- **Real Supabase stack for pgTAP** — requires Docker; report if unavailable, do not mark as passing.

---

## Acceptance criteria (definition of done)

1. `/jobs/[slug]` application CTA buttons link to `/register` and `/login` — no 404.
2. Authenticated candidate can select and attach a parsed CV/resume when applying; employer sees and can download it on the application detail page via `/api/resumes/[id]/download`.
3. Submitting an application enqueues an email + push notification to the candidate and to all active company members (owner/recruiter).
4. Employer changing application status enqueues a status-change notification to the candidate.
5. Vercel Cron triggers both delivery paths (`/api/push/dispatch` and `/api/cron/send-application-notifications`) on a schedule; no pending notifications stranded indefinitely.
6. `bun run lint`, `bun run typecheck`, `bun run build`, and relevant unit/E2E tests pass.