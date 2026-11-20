# Domain feature modules

V4 is a modular monolith. Domain rules live in feature modules and are enforced
again at the database boundary; a Server Action or a client-side role value is
never the final authorization decision.

## Implemented user-facing verticals

- **identity** — localized registration, sign-in, sign-out, password recovery,
  confirmation, OAuth configuration gates, account status and self-service
  account-deletion attempt.
- **companies** — company creation, membership-scoped workspace, company profile
  submission/review and public employer directory.
- **candidates** — private candidate profile editing, application history and
  status tracking. CV text extraction runs in the browser and produces an
  editable draft; the original file is not uploaded or stored.
- **jobs / applications** — public job search/detail, imported source listings,
  candidate application submission and status transitions, employer application
  review/detail, plus server/database operations for job drafts, moderation,
  package entitlement and publication.

## Important implementation boundaries

The job lifecycle is not yet a complete employer/admin product flow. The
employer-facing job create/edit/list UI and the platform-admin job-moderation
queue UI are absent even though their Server Actions, DAL functions and
PostgreSQL RPCs exist. Do not describe job authoring or moderation screens as
available until those routes and their E2E coverage ship.

The public package catalogue displays inquiry-oriented package information and
1/7/30-day price options. It is not checkout, payment processing or
reconciliation. The separate internal `job_packages` entitlement model is
managed by administrators; its catalogue has no default rows, and publishing
is denied until an active package is assigned to a verified company. Confirm
the commercial duration rule before changing the operational entitlement model:
the public price matrix offers 1, 7 and 30 days, while an internal package
assignment snapshots one configured `job_duration_days` value.

## Not implemented / placeholder modules

- `billing`, `credit-ledger`, `ministry`, and `resumes` currently contain
  placeholders rather than complete domain workflows. The `applications/`
  directory is also a placeholder; application domain code currently lives in
  `jobs/`.
- CV file upload/storage, public candidate discovery, external CV-AI processing,
  online checkout and payment reconciliation are not active product flows.
- `chat` is a separately gated support integration; its presence does not
  mean candidate/employer AI chat is enabled.

## Security rules

- Modules do not mutate another domain's tables directly; use explicit
  server-side interfaces, DAL DTOs and reviewed database functions.
- Never accept `candidate`, `platform_admin` or employer authority from a
  client form or mutable Auth metadata. Company access is determined by active
  membership and permission within the specific `company_id`.
- Verify package rights, resource ownership, state transitions and idempotency
  on the server and again in PostgreSQL.
- External services require explicit adapters, timeouts, consent and a reviewed
  data-handling policy. Never present a fallback as end-to-end success.
- A vertical is complete only when its schema/migration, grants, positive and
  negative authorization tests, failure/idempotency behavior, UI, E2E coverage
  and operational runbook are all in place.
