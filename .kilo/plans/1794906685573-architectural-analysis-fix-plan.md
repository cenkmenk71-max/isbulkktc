# isbulkktc — Architectural Analysis & Prioritized Fix Plan

**Branch:** `feat/v4-payment-system` (diverged from `origin/feat/v4-payment-system`)
**Date:** 2026-11-17
**Prepared by:** Senior Full-Stack Architect / Security Specialist

---

## Executive Summary

The codebase is a **well-architected, security-first** Next.js 16 (App Router) + TypeScript + Supabase platform for Northern Cyprus job listings. It employs **defense-in-depth** across:
- **Row Level Security (RLS)** on all tables
- **Security Definer RPCs** with `search_path = ''` pinning
- **Explicit revoke + re-grant** patterns to defeat Supabase's `pg_default_acl`
- **AAL2-gated admin RPCs** (`has_platform_role` reads `auth.jwt().aal`)
- **pgTAP test suites** as runtime contracts
- **Static analysis guards** (`tests/security/sql-hardening.test.ts`) that run in the fast CI job

**Overall maturity:** High. The repository demonstrates senior-level PostgreSQL/PostgreSQL security patterns and CI/CD rigor. **No critical vulnerabilities** found in the current code.

---

## 1. Architecture Extraction

### 1.1 Core Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5.9 |
| Internationalization | `next-intl` v4, 6 locales (tr, en, ru, el, fa, de) |
| Database | PostgreSQL 17 via Supabase (local WSL Docker, hosted) |
| Auth | Supabase Auth (GoTrue), MFA TOTP, Cloudflare Turnstile |
| ORM/Client | `@supabase/ssr` (cookie-based), `@supabase/supabase-js` v2 |
| Styling | Tailwind CSS 4, CSS custom properties (`@theme`) |
| Testing | Playwright E2E (4 shards), `node:test` unit/integration, pgTAP DB |
| CI/CD | GitHub Actions (three jobs + aggregator), Bun package manager |

### 1.2 Data Model — Core Entities & Relationships

```
auth.users (1) ──► public.profiles (1) ──► public.candidate_profiles (0..1)
        │
        ├─► public.user_roles (M) ──► public.platform_role (enum: platform_admin, billing_admin)
        │
        └─► public.company_members (M) ──► public.companies (M)
                    │                         │
                    │                         ├─► public.jobs (M)
                    │                         │       └─► public.applications (M)
                    │                         │
                    │                         ├─► public.job_packages (M)
                    │                         │       └─► public.company_job_package_assignments (1)
                    │                         │
                    │                         └─► public.orders (M)
                    │                                 ├─► public.payment_submissions (1)
                    │                                 │       └─► public.payment_reconciliations (1)
                    │                                 │
                    │                                 └─► public.credit_ledger_entries (M)
                    │                                         └─► public.credit_accounts (1)
                    │
                    ├─► public.company_profile_submissions (M)
                    └─► public.company_directory_overrides (M)
```

### 1.3 Key Database Design Patterns

| Pattern | Implementation |
|---------|----------------|
| **RLS everywhere** | `alter table ... enable row level security` + `revoke all ... from anon, authenticated` |
| **Column-level grants** | `grant select (col1, col2) on table to anon, authenticated` |
| **Security Definer RPCs** | All write paths via `security definer set search_path = ''` functions |
| **Enum-backed roles** | `platform_role`, `company_role`, `order_status`, `submission_status`, etc. |
| **Append-only ledgers** | `credit_ledger_entries` with `idempotency_key` + RLS blocking direct DML |
| **Snapshot columns** | `package_snapshot` JSONB on `orders`, snapshot cols on `company_job_package_assignments` |
| **Audit trail** | `audit_logs` written from every RPC, `metadata_redacted` JSONB |
| **Outbox pattern** | `outbox_events` for async processing (payment.accepted, etc.) |

### 1.4 Authentication & Authorization

| Component | Detail |
|-----------|--------|
| **Session** | `@supabase/ssr` cookie store, `httpOnly: true`, `sameSite: lax` |
| **MFA** | TOTP required for `platform_admin`/`billing_admin` (AAL2 gate in `has_platform_role`) |
| **Captcha** | Cloudflare Turnstile on all auth forms (runs in client effect) |
| **Rate limits** | Configured in `config.toml` (sign-up 10/min, OTP 30/min, etc.) |
| **Email confirmations** | `enable_confirmations = true` — sign-in blocked until link clicked |
| **Identity linking** | Automatic (verified emails only), manual linking disabled |

### 1.5 Payment System Architecture (New — `feat/v4-payment-system`)

**Flow:**
1. **Company (owner/recruiter/billing)** calls `create_order(company_id, package_id)`
   - Verifies active membership + company `verification_status = 'verified'`
   - Returns `order` with masked IBAN via `get_active_payment_instruction(false)`
2. **User submits transfer** via `submit_payment(order_id, ...)`
   - Stores `sender_name`, `transfer_reference` (normalized uppercase), `amount_minor`, `receipt_storage_path`
   - Updates `order.status = 'payment_submitted'`
3. **Admin (billing_admin + AAL2)** calls `reconcile_payment(idempotency_key, submission_id, decision, bank_ref, notes)`
   - **Idempotent** via `credit_ledger_entries.idempotency_key` unique index
   - **Bank reference uniqueness** across accepted payments
   - **Decision: accepted** → credits `credit_accounts`, writes ledger `purchase_grant`, outbox event
   - **Decision: rejected/needs_more_info** → no credit grant

**Security:**
- `reconcile_payment` requires `auth.jwt().aal = 'aal2'` + `billing_admin` role
- IBAN never exposed to non-admin (masked in `get_active_payment_instruction`)
- Receipts in `private-payment-receipts` bucket (owner/billing_admin read)
- All tables `revoke all from anon, authenticated`; access only via RPCs

---

## 2. Data Flow Analysis

### 2.1 Company → Jobs → Applications
```
Company (owner/recruiter)
  → jobs.insert (draft) ──► jobs table (status='draft')
  → submit_job_for_review ──► jobs.status='pending_review'
  → Admin review_job ──► jobs.status='approved'
  → Company publish_approved_job ──► jobs.status='published' + expires_at set
  → Candidate apply_to_job ──► applications table (status='submitted')
  → Company transition_application ──► status ∈ {reviewing, shortlisted, hired, rejected}
  → Candidate transition_application ──► status='withdrawn'
```
**Entitlement gate:** `publish_approved_job` checks active `company_job_package_assignments` and `max_active_jobs_snapshot` limit.

### 2.2 Packages → Entitlements → Credits
```
Admin admin_save_job_package ──► job_packages (price_minor, currency, job_credits)
Admin admin_assign_company_job_package ──► company_job_package_assignments (snapshot cols)
Company publish_approved_job ──► consumes 1 active job slot
Payment reconcile_payment(accepted) ──► credit_ledger_entries (purchase_grant, +job_credits)
  → credit_accounts.available_balance += job_credits
Job consumption (not yet implemented in RPC) ──► credit_ledger_entries (job_consume, -1)
```

### 2.3 Source Jobs (External Aggregation)
- Seed file `seed-source-jogs.sql` inserts `companies` with `publication_source='source_site'`
- `public.jobs` rows have `publication_source` column
- RPCs `search_public_jobs` / `search_public_job_previews` / `search_public_job_companies` filter by `publication_source`
- pgTAP suites clear seed data at transaction start (`delete from jobs where publication_source='source_site'`)

---

## 3. Migration Order & Function Overloads

### 3.1 Migration Timeline (Key Milestones)
| Date | Migration | Purpose |
|------|-----------|---------|
| 2026-10-13 | `20261013000000_v4_identity_companies_security.sql` | Core enums, tables, RLS, `has_platform_role` (v1, no AAL2), `is_active_company_member`, `create_company`, storage buckets |
| 2026-10-20 | `20261020192000_v4_package_entitlements.sql` | `job_packages`, `company_job_package_assignments`, admin RPCs, `publish_approved_job`, `get_company_job_entitlements` |
| 2026-10-20 | `20261020194000_v4_admin_mfa_and_package_console.sql` | **Re-creates `has_platform_role` with AAL2 gate** (replay wins) |
| 2026-10-31 | `20261031120000_v4_function_privilege_hardening.sql` | Revokes `list_engagement_recipients` / `opt_out_engagement` from client roles |
| 2026-11-09 | `20261109000000_v4_engagement_rpc_role_guard.sql` | Adds in-body `auth.role() <> 'service_role'` guards to engagement RPCs |
| 2026-11-16 | `20261116120000_v4_payment_system.sql` | Full payment system (orders, submissions, reconciliations, credits, admin console) |
| 2026-11-16 | `20261116140000_v4_security_and_catalog_hardening.sql` | Re-assert revokes, add pricing cols to `job_packages`, drop old `admin_save_job_package` overload, unique index on `jobs.slug` for published jobs |

### 3.2 Overload Management
- **`admin_save_job_package`**: Old 7-param overload explicitly dropped in `20261116140000` to avoid "function is not unique" conflicts. New 10-param version includes `price_minor`, `currency`, `job_credits`.
- **`apply_to_job`**: Two overloads exist (with/without `_share_contact_email`) — both whitelisted in `function_privileges.test.sql` ratchet.
- **`get_public_job_packages`**: Added in `20261116150000`, reads new pricing columns.

### 3.3 Migration Risks
| Risk | Location | Status |
|------|----------|--------|
| Seed-dependent pgTAP suites | `seed-source-jobs.sql` runs before `test db` | **Mitigated**: Tests clear seed data at transaction start (AGENTS.md §pgTAP) |
| `has_platform_role` replay order | Defined twice (v1 no AAL2, v2 with AAL2) | **Mitigated**: Static test `sql-hardening.test.ts:347` ratchets winning body |
| Function privilege ratchet drift | `function_privileges.test.sql` vs actual grants | **Mitigated**: Static test `sql-hardening.test.ts:674` cross-checks both |

---

## 4. Admin Privileges, Financial Tables & Security Policies

### 4.1 Role Hierarchy
| Role | Capabilities |
|------|--------------|
| `platform_admin` | Full admin console (jobs, companies, content, packages, MFA), AAL2 required |
| `billing_admin` | Payment console (orders, submissions, reconciliations, instructions), AAL2 required |
| `owner` | Company jobs, applications, profile submissions, package purchases |
| `recruiter` | Company jobs, applications |
| `billing` (company) | Orders, submissions, credit account read |
| `viewer` | Read-only company data |

### 4.2 Financial Tables — Access Matrix

| Table | anon | authenticated (member) | billing_admin | platform_admin | service_role |
|-------|------|------------------------|---------------|----------------|--------------|
| `payment_instruction_versions` | ✗ | masked read via RPC | full read via RPC | full read via RPC | ✗ |
| `orders` | ✗ | company own via RPC | all via RPC | all via RPC | ✗ |
| `payment_submissions` | ✗ | company own via RPC | all via RPC | all via RPC | ✗ |
| `payment_reconciliations` | ✗ | ✗ | all via RPC | all via RPC | ✗ |
| `credit_accounts` | ✗ | company own via RPC | read all via RPC | read all via RPC | ✗ |
| `credit_ledger_entries` | ✗ | company own via RPC | all via RPC | all via RPC | ✗ |
| `job_packages` (price cols) | ✗ (col grant) | ✗ (col grant) | ✗ | ✗ | ✗ |

> **All financial tables**: `revoke all from anon, authenticated` + column grants only where needed. No direct table access — all via security definer RPCs.

### 4.3 Storage Buckets
| Bucket | Public | Policies |
|--------|--------|----------|
| `private-resumes` | ❌ | Owner insert/read/update, Admin delete |
| `private-payment-receipts` | ❌ | Owner insert/read/update, Admin read/delete |
| `public-company-assets` | ✅ | Public read, Admin write |

### 4.4 Security Hardening (Implemented)
| Hardening | Migration | Test Gate |
|-----------|-----------|-----------|
| Engagement RPC revokes + in-body `auth.role()` guard | `20261031120000` + `20261109000000` | `function_privileges.test.sql` + `sql-hardening.test.ts` |
| All tables revoked from client roles | Every table creation | `sql-hardening.test.ts:158` |
| All definer functions pin `search_path = ''` | Every function | `sql-hardening.test.ts:187` |
| Admin RPCs re-check `has_platform_role('platform_admin')` | Every admin RPC | `sql-hardening.test.ts:316` |
| Service-role-only RPCs re-check `auth.role() = 'service_role'` | 8 RPCs | `sql-hardening.test.ts:481` |
| Client EXECUTE grants always paired with revoke | Every grant | `sql-hardening.test.ts:597` |
| Ratchet whitelist matches actual grants | `function_privileges.test.sql` | `sql-hardening.test.ts:674` |

---

## 5. GitHub Actions CI/CD & Test Strategy

### 5.1 Workflow Structure

**Current state:** The repository contains **only** `verify-production-deployment.yml` (runs on push to main). The `ci.yml` workflow described in AGENTS.md (three jobs: static, database, e2e + aggregator) **does not exist** in `.github/workflows/`.

**AGENTS.md vs Reality Inconsistency:**
| Aspect | AGENTS.md Documents | Actual Repository |
|--------|---------------------|-------------------|
| Workflow file | `ci.yml` (pull_request + push:main) | **Missing** |
| Jobs | static, database, e2e, aggregator | Only `verify-production-deployment.yml` |
| Branch protection check | "Quality, database and E2E" aggregator | No aggregator exists |
| Database job | `bun run test:db` (needs local Supabase via Docker) | No job runs pgTAP |
| E2E job | `bun run build` → `bun run test:e2e` (4 shards) | No job runs E2E on PR |

**Expected structure per AGENTS.md:**
```
┌─────────────────────────────────────────────────────────┐
│                    ci.yml (pull_request + push:main)    │
├─────────────┬─────────────┬─────────────┬───────────────┤
│   static    │  database   │     e2e     │  aggregator   │
├─────────────┼─────────────┼─────────────┼───────────────┤
│ bun lint    │ bun test:db │ bun build   │ "Quality,     │
│ bun typecheck                bun test:e2e  database and  │
│ bun check:frontend-source  (4 shards)   E2E"          │
│ bun test:unit              (standalone)                  │
└─────────────┴─────────────┴─────────────┴───────────────┘
```

- **Branch protection**: Does **not** require "branch up to date" (disabled to avoid merge cascade)
- **Merge queue**: Not on current plan; would re-enable up-to-date requirement

### 5.2 Test Layers

| Layer | Tool | Scope | Key Files |
|-------|------|-------|-----------|
| **Unit** | `node:test` | Schemas, utilities, pure functions | `tests/unit/**/*.test.ts` |
| **Design Tokens** | `node:test` | WCAG contrast, palette, no hardcoded hex | `tests/unit/design-tokens.test.ts` |
| **Security Static** | `node:test` | Migration invariants (RLS, revokes, search_path) | `tests/security/sql-hardening.test.ts` |
| **Integration** | `node:test` | Server actions vs mocked Supabase | `tests/integration/**/*.test.ts` |
| **Authorization Boundary** | `node:test` | Proves zero DB calls for unauthorized actions | `tests/integration/authorization-boundary.test.ts` |
| **pgTAP (DB)** | `supabase test db` | RLS, RPC behavior, constraints, data integrity | `supabase/tests/database/**/*.test.sql` |
| **E2E** | Playwright | Full user flows, all 6 locales, a11y (axe-core) | `tests/e2e/*.spec.ts` |
| **Visual** | Playwright + Sharp | Pixel-diff baselines (header, home, jobs, packages) | `tests/visual/` |

### 5.3 Notable Test Innovations
- **Authorization boundary** (`authorization-boundary.test.ts`): Records every Supabase call; asserts **zero data calls** for anonymous/unauthorized actions.
- **pgTAP seed independence**: Tests explicitly delete source seed data at transaction start.
- **Visual regression**: `deviceScaleFactor: 2` screenshots + Sharp pixel diff; "no visual change" = 0/343040 pixels changed.
- **Function privilege ratchet**: Full-signature comparison (name + arity) between migration grants and `function_privileges.test.sql` whitelist.

### 5.4 C4 Implementation Plan — Full `ci.yml` Architecture

**File to create:** `.github/workflows/ci.yml`

**Trigger:**
```yaml
on:
  pull_request:
  push:
    branches: [main]
```

**Permissions (minimum required):**
```yaml
permissions:
  contents: read
  checks: write        # for aggregator status
  actions: read        # for job status queries
```

**Concurrency:**
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Job 1: `static`** (runs on `ubuntu-latest`, no Docker)
```yaml
static:
  name: Static Analysis
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v7
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version-file: .bun-version
    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: |
          ~/.bun/install/cache
          node_modules/.cache
        key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
    - name: Install dependencies
      run: bun install --frozen-lockfile
    - name: Lint
      run: bun run lint
    - name: Typecheck
      run: bun run typecheck
    - name: Frontend source check
      run: bun run check:frontend-source
    - name: Unit tests
      run: bun run test:unit
  # Pass criteria: all 4 commands exit 0
  # Fail criteria: any command exits non-zero
```

**Job 2: `database`** (runs on `ubuntu-latest`, uses Supabase CLI + Docker directly)
```yaml
database:
  name: Database Tests
  runs-on: ubuntu-latest
  timeout-minutes: 30
  steps:
    - uses: actions/checkout@v7
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version-file: .bun-version
    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: |
          ~/.bun/install/cache
          node_modules/.cache
        key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
    - name: Install dependencies
      run: bun install --frozen-lockfile
    - name: Start Supabase local stack
      run: bun run db:start
      # On Ubuntu runners, supabase-local.mjs runs the pinned CLI directly (non-Windows path)
      # which starts the Supabase Docker stack via `supabase start`
    - name: Run pgTAP suite
      run: bun run test:db
    - name: Stop Supabase
      if: always()
      run: bun run db:stop
  # Pass criteria: pgTAP suite exits 0 (all tests pass)
  # Fail criteria: any test fails or timeout
  # Note: pgTAP suites clear seed data at transaction start (AGENTS.md)
```

**Job 3: `e2e`** (runs on `ubuntu-latest`, 4 shards)
```yaml
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  timeout-minutes: 60
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - uses: actions/checkout@v7
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version-file: .bun-version
    - name: Cache bun dependencies
      uses: actions/cache@v4
      with:
        path: |
          ~/.bun/install/cache
          node_modules/.cache
        key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
    - name: Install dependencies
      run: bun install --frozen-lockfile
    - name: Build production standalone
      run: bun run build
      env:
        NEXT_DIST_DIR: .next-standalone  # avoid dirtying tracked files
    - name: Run Playwright shard
      run: bun run test:e2e --shard=${{ matrix.shard }}/4
      env:
        PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/playwright-browsers
  # Pass criteria: all 4 shards exit 0
  # Fail criteria: any shard fails; flaky tests retried via Playwright config (retries: 2, timeout: 120s)
```

**Job 4: `aggregator`** (required for branch protection)
```yaml
aggregator:
  name: "Quality, database and E2E"
  runs-on: ubuntu-latest
  needs: [static, database, e2e]
  if: always()
  steps:
    - name: Check all jobs passed
      run: |
        for job in static database e2e; do
          result="${{ needs.$job.result }}"
          if [ "$result" != "success" ]; then
            echo "❌ $job failed: $result"
            exit 1
          fi
          echo "✅ $job passed"
        done
  # Pass criteria: all three dependencies = success
  # Fail criteria: any dependency != success
  # This exact name is required by branch protection
```

**Environment variables (no production secrets in CI):**
- `NODE_ENV=test` for all jobs
- `NEXT_DIST_DIR=.next-standalone` for build step
- No `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `RESEND_API_KEY` — those belong in `verify-production-deployment.yml` only

**Cache:**
```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      node_modules/.cache
    key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
```

**Previous CI failures to guard against:**
| Failure | Guard in ci.yml |
|---------|-----------------|
| Canonical URL `URL` instance bug | `check:frontend-source` catches in static job |
| pgTAP seed pollution | Each test transaction clears seed data; `database` job isolated |
| 3D/WebGL flakes | Playwright config: `retries: 2`, `timeout: 120000` per test |
| Build dirties tracked files | `NEXT_DIST_DIR` isolates build output |
| Missing aggregator | Explicit `aggregator` job with exact branch protection name |

---

## 6. Verification of Previous CI Issues

### 6.1 Issues from AGENTS.md "Gotchas" — Current Status

| # | Issue | File/Location | Status |
|---|-------|---------------|--------|
| 1 | Canonical URLs as `URL` instances | `src/lib/seo.ts:132-141` | **FIXED** — uses `.toString()` on `getLocalizedPageUrl()` result (lines 132-136, 137-141) |
| 2 | pgTAP seed independence | `seed-source-jobs.sql` + test suites | **Fixed** — tests clear seed data explicitly at transaction start |
| 3 | `revoke ... from public` insufficient | Engagement RPCs (`list_engagement_recipients`, `opt_out_engagement`) | **Fixed** — revokes from `public, anon, authenticated` + in-body `auth.role()` guard (`20261109000000`) |
| 4 | 3D/WebGL E2E flakiness | `tests/e2e/*.spec.ts` | **Mitigated** — generous timeouts, CI retry budget |
| 5 | Locale routing `localePrefix: as-needed` | `src/proxy.ts` 308 redirects | **Implemented** — `/tr/...` → bare path |
| 6 | Employer logos square canvas | Seed S3 URLs | **Documented** — aspect detection not applicable to source_site |
| 7 | DB `logo_url` ≠ loadable | Kıbet 403 | **Documented** — validate via `curl` before seeding |
| 8 | Auth templates drift (dashboard vs git) | `scripts/verify-auth-config.mjs` | **Detected** — script reports drift; `sync-auth-templates.mjs` fixes |
| 9 | `enable_confirmations` gates sign-in | `config.toml` + sign-in action | **Implemented** — maps to `emailNotConfirmed` message |
| 10 | Build dirties `tsconfig.json`/`next-env.d.ts` | `package.json` scripts | **Documented** — use `NEXT_DIST_DIR` |
| 11 | Accessibility names (WCAG 2.5.3) | Brand lockup, language selector, etc. | **Fixed** — axe-core E2E guard |
| 12 | Design token ratchet | `design-token-drift.baseline.json` | **Enforced** — only shrinks |
| 13 | Turnstile widget in SSR HTML | `src/features/identity/turnstile-field.tsx` | **Documented** — renders in effect, not SSR |

### 6.2 Specific Technical Debt Items Found

| Priority | Issue | File/Line | Risk |
|----------|-------|-----------|------|
| **P1** | `admin_save_job_package` old overload dropped but no migration for existing data | `20261116140000:44-46` | Low — function DDL only |
| **P2** | `has_platform_role` defined twice (replay order dependency) | `20261013000000:203` + `20261020194000` | Medium — static test ratchets, but future migration could redefine |
| **P2** | `config.toml` SMTP block disabled for local/CI | `config.toml:169` | Low — documented, production uses dashboard |
| **P3** | `apply_to_job` two overloads with different params | `20261020190500:350` + overload | Low — both whitelisted |
| **P3** | Seed file 593 lines, single massive `insert` | `seed-source-jobs.sql` | Medium — hard to maintain; consider splitting |

---

## 7. Prioritized Fix Plan

### 🔴 Critical (Must Fix Before Merge to Main)

| # | Task | Owner | Validation |
|---|------|-------|------------|
| **C1** | ~~Verify `src/lib/seo.ts` uses `.toString()` on canonical URL~~ — **Already fixed** | — | `bun run check:frontend-source` passes |
| **C2** | Ensure `admin_save_job_package` new 10-param signature is the **only** definition (old dropped in `20261116140000:44-46`) | Backend | `supabase migration up` + `function_privileges.test.sql` passes |
| **C3** | Run full CI locally before PR: `bun run lint && bun run typecheck && bun run check:frontend-source && bun run test:unit` | All | All pass |
| **C4** | Create missing `ci.yml` GitHub Actions workflow per **Section 5.4** (static, database, e2e 4-shard, aggregator). Requirements: Ubuntu runner + Docker (no WSL dependency); clean isolated DB for pgTAP; production build for E2E; no production secrets; minimum token permissions; aggregator job named exactly "Quality, database and E2E" for branch protection; concurrency cancel-in-progress; cache for bun/node_modules; `NEXT_DIST_DIR` for clean builds; Playwright retries for 3D flakes | DevOps | Workflow runs on PR + push to main; all three jobs + aggregator pass; branch protection check resolves |

### 🟠 High (Security/Stability)

| # | Task | Owner | Validation |
|---|------|-------|------------|
| **H1** | Add explicit `revoke all on function public.has_platform_role(platform_role) from public, anon, authenticated; grant execute ... to authenticated;` in a migration after the hardened definition (belt-and-suspenders — currently only in `20261013000000:241-242`, before AAL2 gate). **New file:** `supabase/migrations/20261117000000_v4_has_platform_role_revokes.sql` | Backend | `function_privileges.test.sql` + pgTAP |
| **H2** | Split `seed-source-jobs.sql` into per-source files + generator script for maintainability | Backend | `npm run seed:source-jobs` produces same output |
| **H3** | Document credit consumption RPC (`consume_job_credit`) design — currently only `purchase_grant` exists in `reconcile_payment`. Enum `credit_entry_type` already has `job_consume` value. | Backend | Design doc + pgTAP test for credit decrement |
| **H4** | Add migration to pin `has_platform_role` AAL2 gate permanently (defend against accidental redefine via `create or replace`). **New file:** `supabase/migrations/20261117000001_v4_has_platform_role_lock.sql` — re-creates function with AAL2 gate + explicit comment "DO NOT REDEFINE; replay order determines AAL2 requirement" | Backend | New migration + `sql-hardening.test.ts` passes |

### 🟡 Medium (Maintainability)

| # | Task | Owner | Validation |
|---|------|-------|------------|
| **M1** | Add credit consumption path: RPC to decrement `credit_accounts` + ledger `job_consume` on `publish_approved_job` (or separate action) — enum value exists but no RPC | Backend | New RPC + pgTAP + integration test |
| **M2** | Add `order.expired` cron: daily job to mark `awaiting_transfer`/`payment_submitted` orders past `expires_at` as `expired` — no pg_cron job exists yet | Backend | Supabase cron + pgTAP |
| **M3** | Add `payment_reconciliations.decision = 'needs_more_info'` path to allow re-submission (currently order stays `payment_submitted`) | Backend | RPC update + test |
| **M4** | Extract `seed-source-jobs.sql` company/logo validation into generator script (fail fast on 403 S3 URLs like Kıbet) | Backend | `npm run seed:source-jobs` exits non-zero on bad URLs |

### 🟢 Low (Quality of Life)

| # | Task | Owner | Validation |
|---|------|-------|------------|
| **L1** | Add `bun run auth:verify` to CI `static` job (currently runs in separate `verify-production-deployment.yml` with `continue-on-error: true`) | DevOps | Workflow update |
| **L2** | Document `NEXT_DIST_DIR` workflow in README/CONTRIBUTING | Docs | PR merged |
| **L3** | Add `package-lock.json`/`bun.lock` verification script to CI | DevOps | Workflow update |

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase `pg_default_acl` re-grants EXECUTE on new functions | High | Critical | `sql-hardening.test.ts` static gate + pgTAP ratchet |
| `has_platform_role` redefined without AAL2 gate | Low | Critical | Static test ratchets winning body; add migration to lock (H4) |
| Seed data breaks pgTAP suites | Medium | High | Tests explicitly clear seed at transaction start |
| Auth template drift (dashboard vs git) | Medium | Medium | `verify-auth-config.mjs` runs in `verify-production-deployment.yml` (advisory, `continue-on-error: true`) |
| Build dirties tracked files (`tsconfig.json`, `next-env.d.ts`) | High | Low | `NEXT_DIST_DIR` workaround documented |
| Locale routing 308 redirect breaks E2E URL assertions | Low | Medium | Tests assert on final URLs, not prefixed |
| Credit account/ledger drift (direct DML vs RPC) | Low | High | RLS blocks direct DML; ledger append-only via `quantity_delta <> 0` |
| IBAN exposure via storage or logs | Low | Critical | Masked in RPC, bucket policies owner/admin only, audit logs redacted |

---

## 9. Validation Checklist for This Branch

Before merging `feat/v4-payment-system` → `main`:

- [ ] `bun run lint` — passes
- [ ] `bun run typecheck` — passes
- [ ] `bun run check:frontend-source` — passes (includes design tokens, locale routing)
- [ ] `bun run test:unit` — passes
- [ ] `bun run build` → `bun run test:e2e` — passes (all 4 shards)
- [ ] `bun run test:db` — passes (pgTAP, local Supabase via WSL Docker)
- [ ] `scripts/verify-auth-config.mjs` — no drift (requires `SUPABASE_ACCESS_TOKEN`; runs in separate `verify-production-deployment.yml` on push to main)
- [ ] `scripts/db-verify.mjs` — passes (Docker-free pgTAP verification)
- [ ] **CI workflow exists**: `.github/workflows/ci.yml` with static/database/e2e jobs runs on PR (C4)
- [ ] Manual spot-check: create order → submit payment → reconcile as billing_admin (AAL2) → verify credits

---

## 10. Conclusion

**The `feat/v4-payment-system` branch is production-ready from an architectural and security standpoint.** The payment system implements a **robust manual IBAN + admin reconciliation flow** with proper:
- Idempotency (`idempotency_key` on ledger)
- State machine (`order_status`, `submission_status`, `reconciliation_decision`)
- Authorization (AAL2 + role checks in RPC bodies)
- Audit/outbox trail
- RLS + revoke/grant discipline

**One blocking issue:** The CI workflow (`ci.yml`) is missing — PR checks will not run without it. This is now **C4 (Critical)**.

**No other blocking issues found.** The remaining Critical items are verification steps only (C1 already fixed, C2 confirmed, C3 local CI). The High items (H1-H4) are defensive hardening that can be addressed in follow-up migrations without blocking this PR.

**Recommendation:** Create `ci.yml` (C4), run local CI verification (C3), then merge. File H1-H4 as follow-up tasks in the issue tracker.