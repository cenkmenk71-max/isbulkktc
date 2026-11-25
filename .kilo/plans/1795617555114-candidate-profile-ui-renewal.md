# Plan: İşBul KKTC Aday Profili Kurumsal UI/UX Yenileme

**Plan file:** `.kilo/plans/1795617555114-candidate-profile-ui-renewal.md`
**Goal:** Zero-error implementation plan. No source files are modified by this plan.

---

## Scope

**In scope:**
- `src/features/candidates/candidate-profile-form.tsx` — accordion cards, select preferences, revert, salaryExpectation removal
- `src/features/candidates/schemas.ts` — schema type changes, salaryExpectation removal
- `src/features/candidates/actions.ts` — server action mapping, salaryExpectation removal
- `src/features/candidates/resume-profile-draft.ts` — type alignment, salaryExpectation removal
- `src/server/dal/user.ts` — DAL read mapping `arr?.[0] ?? ""`, drop `salary_expectation` column and profile return field
- `src/features/identity/delete-account-button.tsx` — dialog role, ESC close
- `src/app/[locale]/(candidate)/profile/dashboard/page.tsx` — "Tehlikeli Bölge" card wrapper
- `src/styles/global.css` — accordion, select, dialog, danger zone styles
- `src/messages/{tr,en,ru,el,fa,de}.json` — i18n keys for all 6 languages
- `tests/` — unit, integration, security updates for changed UI/schema

**Out of scope (do not touch):**
- CV parser 3-layer pipeline (`resume-parser.ts`, `convertPdfToImages`, `pageImages` PDF→JPEG)
- Database columns `job_type_preference` / `workplace_mode_preference` / `salary_expectation` remain — no migration
- All other features (jobs, company, employer workspace)

---

## Constraints (hard)

1. **Never break the CV parser.** `convertPdfToImages` and `mergeResumeDraft` keep working. `mergeResumeDraft` passes `jobTypePreference`/`workplaceModePreference` through unchanged — type changes from `string[]` to `string` only.
2. **DB columns stay `text[]`.** No SQL migration. Conversion at form/action boundary: write `value ? [value] : []`, read `arr?.[0] ?? ""`.
3. **Never commit changes.** Plan only.
4. **6-language i18n completeness.** Every new UI string added to all 6 message files.
5. **Tests 100% compatible.** All test files referencing changed UI/schema must be updated.

---

## Resolved design decisions

### D1 — Schema pattern for single-string preferences (resolved)

Use `z.string().refine()` instead of `z.enum()`, because `z.enum` rejects `""` (the "Seçilmedi" value) while the form must allow it.

```ts
jobTypePreference: z
  .string()
  .refine(
    (value) => value === "" || jobTypeKeys.includes(value as JobTypeKey),
    { message: "invalid job type" }
  )
  .default(""),
workplaceModePreference: z
  .string()
  .refine(
    (value) => value === "" || workplaceModeValues.includes(value as (typeof workplaceModeValues)[number]),
    { message: "invalid workplace mode" }
  )
  .default(""),
```

Types become `jobTypePreference: string`, `workplaceModePreference: string` in `CandidateProfileValues`.

### D2 — Form → action data flow (resolved)

- Hidden input: `name="jobTypePreference" value={jobTypePreference}` (plain string, **no** `JSON.stringify`).
- Hidden input: `name="workplaceModePreference" value={workplaceModePreference}` (plain string).
- Remove `salaryExpectation` hidden input / ProfileEntry entirely.
- Action reads: `(formData.get("jobTypePreference") as string | null) ?? ""` — **not** `parseSection` (which does `JSON.parse` and would fail on a plain string).
- Upsert: `job_type_preference: result.data.jobTypePreference ? [result.data.jobTypePreference] : []`, same for workplace mode.
- Remove `salary_expectation` from upsert object.

### D3 — `initialValues` for revert (resolved)

```ts
const initialValuesRef = useRef<CandidateProfileValues | null>(null);
useEffect(() => {
  if (!initialValuesRef.current) initialValuesRef.current = profile;
}, []);
```
Captures DB-loaded values on first mount. Revert restores all form state from this ref.

### D4 — `hasUnsavedChanges` (resolved)

Derived by comparing current form state to `initialValuesRef.current`:
- Scalars (fullName, phone, headline, location, availability, summary, skillsText, jobTypePreference, workplaceModePreference): direct `!==`.
- Arrays (experience, education, languages, certifications, links): `JSON.stringify(current) !== JSON.stringify(initial)`.
- Revert button disabled when `!hasUnsavedChanges`.

### D5 — Accordion auto-open (resolved)

Function `computeOpenSections()` returns `Set<string>` of sections with data:
- `essentials`: fullName/phone/headline/location/summary non-empty
- `preferences`: jobTypePreference/workplaceModePreference/availability non-empty
- `experience`: `experience.length > 0`
- `education`: `education.length > 0`
- `languagesCerts`: `languages.length > 0 || certifications.length > 0`
- `linksSkills`: `links.length > 0 || skillsText.trim().length > 0`

Called in `useEffect` on mount (dependency: `profile`) and after `handleResumeFile` completes (after `setResumeImported(true)`). Empty sections closed, data sections open.

### D6 — Completion list click → scroll (resolved)

Each `<li>` in `candidate-completion-list` gets `onClick`:
- Map `key` → section key (`headline`/`location`/`skills` → `essentials`, `experience` → `experience`, `education` → `education`, `languages`/`certifications` → `languagesCerts`, `links`/`summary` → `linksSkills`/`essentials`).
- Set that section open.
- Call `sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })`.
Each accordion card section gets a `ref`.

### D7 — Delete account dialog (resolved)

- Container: `role="dialog" aria-modal="true"` (was `role="group"`).
- `onKeyDown`: `event.key === "Escape"` → `setShowConfirm(false)`.
- Focus: when dialog opens, focus the "Vazgeç" (cancel) button; when closes, return focus to the trigger button ("Hesabımı sil").
- Button labels already in i18n: `cancel` = "Vazgeç" (tr), `confirmLabel` = "Hesabımı kalıcı olarak sil" (tr).

### D8 — tr.json `confirmLabel` (resolved)

Change from `"Hesabımı kalıcı olarak sil"` to `"Evet, hesabımı sil"` to match the requirement exactly. Other 5 languages already have appropriate confirm labels (no change needed).

### D9 — Security test impact (resolved)

`tests/security/account-lifecycle-surface.test.ts` asserts on the `deleteAccount` **server action** (lines 204-224) and employer dashboard copy (lines 240-244). Neither is changed by the dialog refactor. **No test changes needed** in this file.

---

## Detailed task list

### Task 1 — schemas.ts

File: `src/features/candidates/schemas.ts`

1a. Remove `salaryExpectation` field (lines 111-117).
1b. Remove `salaryExpectation` from `CandidateProfileValues` type (line 183).
1c. Replace `jobTypePreference` `z.array(z.enum(...))` (lines 101-105) with D1 `z.string().refine(...).default("")`.
1d. Replace `workplaceModePreference` `z.array(z.enum(...))` (lines 106-110) with D1 `z.string().refine(...).default("")`.
1e. Update `CandidateProfileValues` type: `jobTypePreference: string`, `workplaceModePreference: string` (lines 181-182).
1f. `candidateProfileUpdateSchema` unchanged (omits `cvFullText`, extends `fullName`).

### Task 2 — DAL user.ts

File: `src/server/dal/user.ts`

2a. Remove `salary_expectation` from `.select()` column list (line 214).
2b. Line 227: `data?.job_type_preference ?? []` → `(data?.job_type_preference ?? [])?.[0] ?? ""`.
2c. Line 228: `data?.workplace_mode_preference ?? []` → `(data?.workplace_mode_preference ?? [])?.[0] ?? ""`.
2d. Remove line 229: `salaryExpectation: data?.salary_expectation ?? ""`.
2e. Remove `salaryExpectation: profile.data.salaryExpectation` from returned profile object (line 256).

### Task 3 — actions.ts

File: `src/features/candidates/actions.ts`

3a. Remove `salaryExpectation: formData.get("salaryExpectation") ?? ""` from `safeParse` input (line 38).
3b. Line 36: `parseSection("jobTypePreference") ?? []` → `(formData.get("jobTypePreference") as string | null) ?? ""`.
3c. Line 37: `parseSection("workplaceModePreference") ?? []` → `(formData.get("workplaceModePreference") as string | null) ?? ""`.
3d. Upsert lines 62-63: `job_type_preference: result.data.jobTypePreference ? [result.data.jobTypePreference] : []`, same for workplace mode.
3e. Remove `salary_expectation` from upsert object (line 64).

### Task 4 — resume-profile-draft.ts

File: `src/features/candidates/resume-profile-draft.ts`

4a. `CandidateProfileDraft` inherits `CandidateProfileValues` — types flow through automatically (`string` preferences).
4b. Lines 135-137: remove `salaryExpectation: current.salaryExpectation` from the returned `profile` object.

### Task 5 — candidate-profile-form.tsx (major rewrite)

File: `src/features/candidates/candidate-profile-form.tsx` (1315 lines)

5a. Imports: add `useEffect`, `useMemo`, `useCallback` (useRef/useState/useTransition already present). Add `ChevronDown`/`ChevronRight` from lucide-react.
5b. Remove `salaryExpectation` state (lines 179-181).
5c. Change `jobTypePreference`/`workplaceModePreference` state from `string[]` to `string` (lines 173-178), initialized from `profile.jobTypePreference` / `profile.workplaceModePreference`.
5d. Add `initialValuesRef` (D3) and `hasUnsavedChanges` (D4).
5e. Add `openSections` state: `useState<Set<string>>(new Set())` with keys `essentials`, `preferences`, `experience`, `education`, `languagesCerts`, `linksSkills`.
5f. Add `computeOpenSections()` (D5) and call in `useEffect` on mount + after `handleResumeFile` completes.
5g. Add accordion card component: clickable heading (h3 + chevron), content conditional on `openSections.has(key)`, record-count rozet badge for array-based sections.
5h. Replace checkbox fieldsets (lines 698-737) with two `<select>` components:
    - `Çalışma türü`: `<option value="">Seçilmedi</option>` + `jobTypeKeys` options
    - `Çalışma düzeni`: `<option value="">Seçilmedi</option>` + `workplaceModeKeys` options
    - Same height/border/padding as `ProfileEntry` inputs.
5i. 6 accordion cards:
    1. Temel Bilgiler & Özet: fullName, phone, headline, location, summary
    2. Çalışma Tercihleri: jobType select, workplaceMode select, availability
    3. İş Deneyimi: experience entries + rozet (`{experience.length} kayıt`)
    4. Eğitim Bilgileri: education entries + rozet (`{education.length} kayıt`)
    5. Diller & Sertifikalar: languages + certifications entries + rozet
    6. Bağlantılar & Beceriler: links + skills entries + rozet
5j. Remove `additionalSectionsOpen` / `<details>` (lines 214-222, 848-1244).
5k. Completion list `<li>` click → open section + `scrollIntoView` (D6).
5l. Revert button ("Değişiklikleri geri al"):
    - In CV import notification band (after import status message)
    - In save bar (below/next to save button)
    - Disabled when `!hasUnsavedChanges`; on click resets all state to `initialValuesRef.current`.
5m. `isProfileEmpty` (lines 247-262): remove `salaryExpectation.trim()`; `jobTypePreference.length` → `Boolean(jobTypePreference)`; `workplaceModePreference.length` → `Boolean(workplaceModePreference)`.
5n. Hidden inputs (lines 638-665): `jobTypePreference`/`workplaceModePreference` as plain string `value={jobTypePreference}` (no JSON.stringify). Remove `salaryExpectation` hidden input (not present as hidden — remove ProfileEntry in 5b).

### Task 6 — delete-account-button.tsx

File: `src/features/identity/delete-account-button.tsx` (86 lines)

6a. Container: `role="dialog" aria-modal="true"` (line 63).
6b. Add `onKeyDown` → Escape → `setShowConfirm(false)`.
6c. Focus management on open/close.

### Task 7 — page.tsx

File: `src/app/[locale]/(candidate)/profile/dashboard/page.tsx` (155 lines)

7a. Wrap danger section (lines 141-152) in "Tehlikeli Bölge" card with heading.
7b. Keep `DeleteAccountButton` usage unchanged.

### Task 8 — global.css

File: `src/styles/global.css` (14767 lines)

8a. `.candidate-profile-accordion-card` — border, radius, heading, chevron, content area.
8b. `.candidate-profile-section-badge` — record-count rozet.
8c. `select` styling matching `ProfileEntry` input height/border/padding.
8d. `.candidate-danger-zone` / `.danger-zone-card` card styles.
8e. `[role="dialog"]` modal overlay (backdrop, centering, `modal-in` animation).
8f. `prefers-reduced-motion` reset applies to dialog/accordion transitions.

### Task 9 — i18n (all 6 files)

Files: `src/messages/{tr,en,ru,el,fa,de}.json`

Add to `CandidateDashboard` in each:
9a. Remove `salaryExpectationLabel`.
9b. `jobTypePreferenceLabel` → "Çalışma türü" / "Preferred job type" / etc. (singular, since now a select).
9c. `workplaceModePreferenceLabel` → "Çalışma düzeni" / "Preferred work arrangement" / etc. (singular).
9d. `sections.essentials.title` / `sections.essentials.description`.
9e. `sections.preferences.title` / `sections.preferences.description`.
9f. `sections.languagesCerts.title` / `sections.languagesCerts.description`.
9g. `sections.linksSkills.title` / `sections.linksSkills.description`.
9h. `accordion.openAll` ("Tümünü Aç"), `accordion.closeAll` ("Tümünü Kapat").
9i. `revert.label` ("Değişiklikleri geri al"), `revert.title` (tooltip).
9j. `dangerZone.title` ("Tehlikeli Bölge"), `dangerZone.description`.
9k. `deleteAccount.confirmLabel` — tr: change to "Evet, hesabımı sil" (D8). Others already correct.
9l. `deleteAccount.cancel` — tr: "Vazgeç" (already present).

### Task 10 — Tests

10a. `tests/unit/candidate-profile-schema.test.ts`:
    - Remove `salaryExpectation` from all `deepEqual` expected objects (lines 21, 73, 123).
    - Change `jobTypePreference: []` → `jobTypePreference: ""` (lines 19, 71, 121).
    - Change `workplaceModePreference: []` → `workplaceModePreference: ""` (lines 20, 72, 122).
    - Lines 259-296: `jobTypePreference: ["full_time", "freelance", "full_time"]` → `"full_time"`; `workplaceModePreference: ["remote", "hybrid", "remote"]` → `"remote"`; remove `salaryExpectation: "  40,000 TRY  "`; remove `parsed.salaryExpectation` assertion (line 275); `parsed.jobTypePreference` / `parsed.workplaceModePreference` are strings.
    - Lines 283-295: invalid value tests — adjust for single string (`"not-a-job-type"`, `"onsite"`).

10b. `tests/unit/resume-profile-draft.test.ts`:
    - Lines 10-12: `jobTypePreference: []` → `""`, `workplaceModePreference: []` → `""`, remove `salaryExpectation: null`.

10c. `tests/unit/resume-location-merge.test.ts`:
    - Lines 21-23: `jobTypePreference: []` → `""`, `workplaceModePreference: []` → `""`, remove `salaryExpectation: null`.

10d. `tests/integration/data-path.test.ts`:
    - Lines 124-126: `jobTypePreference: ["full_time"]` → `"full_time"`, `workplaceModePreference: ["remote"]` → `"remote"`, remove `salaryExpectation` assertion (line 126).
    - Line 134: remove `salary_expectation` from the select column string.
    - Save test (lines 148-173): no `jobTypePreference`/`workplaceModePreference` in form data (absent → `""` → upsert `[]`). Assertion `"job_type_preference":[]` still passes.

10e. `tests/security/account-lifecycle-surface.test.ts` — no changes needed (D9).

10f. `tests/e2e/account-pages.spec.ts` — tests register/login/recovery, not profile dashboard. No changes needed.
10g. `tests/e2e/accessibility.spec.ts` — tests public routes, not candidate dashboard. No changes needed.

### Task 11 — Verification commands

Run via `bun` (never `npm`):
1. `bun run lint`
2. `bun run typecheck`
3. `bun run test:unit`
4. `bun run test:security`
5. `bun run test:integration`
6. `bun run build` then `bun run test:e2e` (if infra available)
7. `bun run test:db` (if Docker available)

---

## Risk assessment

| Risk | Mitigation |
|------|-----------|
| `z.enum` rejects `""` (unselected) | D1: use `z.string().refine()` allowing `""` |
| `parseSection` does `JSON.parse` failing on plain string | D2: read form data directly, not via `parseSection` |
| `initialValues` captured after a save (stale) | D3: capture only on first mount via `useEffect([])` |
| `hasUnsavedChanges` false negatives | D4: JSON.stringify for arrays, direct compare for scalars |
| Accordion not auto-opening after CV import | D5: call `computeOpenSections()` after `handleResumeFile` |
| `salary_expectation` DB column still exists | Only removed from form/select/action/upsert; column untouched |

---

## Rollback

No database migration. All changes are client/server code + i18n + CSS. Rollback = revert edited files. No data loss: `salary_expectation`, `job_type_preference`, `workplace_mode_preference` DB columns untouched.

---

## Open questions

None. All design decisions resolved (D1-D9). Plan is implementation-ready.