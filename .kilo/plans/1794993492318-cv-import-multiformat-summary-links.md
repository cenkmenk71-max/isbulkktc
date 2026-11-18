# CV import: multi-format extraction + summary & links

## Goal

Make the existing client-side CV import extract **complete** information from
CVs in PDF, DOCX, RTF, ODT and TXT/MD, and populate the candidate profile with a
new **summary** and **links** section in addition to the current fields
(headline, location, skills, experience, education, languages, certifications).

Hard rules that must hold:

1. **No file ever reaches a server.** All reading and parsing stays 100%
   client-side (`File.arrayBuffer()` + browser APIs / bundled ESM).
2. **No client code imports `@/server/**` and no non-`NEXT_PUBLIC_` env reads.**
3. **No external CDN scripts, no `dangerouslySetInnerHTML`.**
4. Preserve the existing six-locale messages and the
   "import → suggestions in form (not saved) → edit → Save" flow.

## Decisions (locked)

- **New profile fields:** add `summary` (single text) and `links`
  (`{ label, url }[]`). Do **not** store personal/contact data (birth date,
  address, phone, email) — those stay on the account; email/phone are
  deliberately filtered out as today.
- **Formats:** support PDF, DOCX, RTF, ODT, TXT/MD. **Drop legacy `.doc`**
  (binary OLE2) — return a dedicated `legacyDoc` error with clear copy
  ("save as PDF or DOCX") instead of a misleading "unreadable".
- **Summary source:** promote the summary/özet headings the parser currently
  discards (`ignoredSectionLabels`) into a real `summary` section; join its
  lines (contact lines dropped).
- **Links source:** collect `http(s)://` / `www.` / bare `linkedin.com/...`,
  `github.com/...` etc. from the whole text into `links`; normalize to a full
  URL; derive a short `label` (`LinkedIn`, `GitHub`, `Website`, else hostname).
- **Stock profile schema maxes:** `summary` ≤ 2000 (nullable, empty → null);
  `links` ≤ 12 entries, `label` ≤ 120, `url` ≤ 600.

## Data flow (unchanged shape, +2 fields)

```
<input accept expanded>
  └─> candidate-profile-form.handleResumeFile(file)
        └─> extractResumeFile (resume-file-extractor)
              └─> extractTextDocument (text-document-extractor)   [PDF|DOCX|RTF|ODT|TXT]
                    └─> parseResumeText (resume-parser)           [+ summary, links]
                        └─> mergeResumeDraft (resume-profile-draft)
                              └─> form state (suggestions, unsaved)
                                    └─> saveCandidateProfile (server action, only on Save)
```

No upload, no server read. `saveCandidateProfile` persists on explicit submit
only (unchanged), now including `summary` and `links`.

---

## Tasks (ordered)

### 1. Dependency

- `bun add fflate` (tiny pure-ESM zip lib, no deps, browser-safe) for ODT
  (`content.xml` lives inside an ODF ZIP). Updates `bun.lock`. No CDN.

### 2. Database + generated types

- New migration `supabase/migrations/20261118000000_v4_candidate_profile_summary_links.sql`:
  ```sql
  alter table public.candidate_profiles
    add column summary text
      check (summary is null or char_length(summary) <= 2000),
    add column links jsonb not null default '[]'::jsonb
      check (public.is_valid_candidate_profile_section(
        links, array['label','url'], 12, 2000));

  grant insert (summary, links), update (summary, links)
    on public.candidate_profiles to authenticated;
  ```
  Reuse the existing generic `is_valid_candidate_profile_section` validator
  (IMMUTABLE, already granted) — **no new function**, so
  `function_privileges.test.sql` stays green. No `visibility` grant is touched
  (it is already revoked; this migration must not re-grant it).
- Extend the hand-kept Supabase types in `src/types/database.ts`
  (`candidate_profiles` Row/Insert/Update): add `summary: string | null` and
  `links: Json`.

### 3. Schema + DAL + server action

- `src/features/candidates/schemas.ts`:
  - `linksEntrySchema = z.object({ label: optionalProfileText(120), url: optionalProfileText(600) }).strict()`.
  - Add to `candidateProfileSchema`: `summary` (`.trim().max(2000).transform(empty→null)`),
    `links` (`.array(linksEntrySchema).max(12).default([]).transform(removeBlankEntries)`).
  - Add `summary` and `links` to `CandidateProfileValues`. Keep `fullName` in the
    write-only update schema as today.
- `src/server/dal/user.ts` `getCandidateWorkspace`: add `summary, links` to the
  `.select(...)`; feed both into `candidateProfileSchema.safeParse` and the
  returned `profile`.
- `src/features/candidates/actions.ts`: read `summary` from `formData`, `links`
  via the existing `parseSection("links")`; include both in the
  `candidate_profiles.upsert`. No new grants needed on the write path.

### 4. Parser — summary + links + accuracy (`resume-parser.ts`)

- Add `summary?: string` and `links?: CandidateLink[]` to `CandidateResumeDraft`;
  add `"summary"` and `"links"` to `ResumeSection`.
- Move summary headings out of `ignoredSectionLabels` into `sectionLabels.summary`
  (özet, özet bilgileri, hakkımda, hakkimda, profil, summary, profile, about,
  about me, objective, career objective, о себе, профиль, σχετικά με εμένα,
  درباره من, über mich, zusammenfassung). Keep personal-data headings
  (kişisel bilgiler, personal details/information, adres/address, doğum etc.)
  in `ignoredSectionLabels`. Keep `isSectionPersonalData`/`isContactLine`
  filtering so email/phone/address never leak into `summary`.
  - Careful regression: `sectionLines` only returns a section when a *heading*
    is seen; a headingless CV's opening prose keeps flowing through
    `inferSections`. Add a `summary` inference: the first non-name, non-contact
    prose block before the first dated/labelled entry becomes `summary` when no
    explicit summary heading was matched.
- Implement `extractLinks(text)`: scan the full (non-truncated-to-section) text
  for URL patterns plus `linkedin.com/in/`, `github.com/`, `gitlab.com/`,
  `behance.net/`, portfolio/`x.com` etc.; normalize (`www.`/bare host →
  `https://`), dedupe by normalized URL, cap 12, derive label. Output
  `{ label, url }[]`. Keep URLs out of every other section (already true via
  `isContactLine`).
- Summary output: `sections.get("summary").join("\n").slice(0, 2000)` after
  dropping contact lines; omit from draft when empty.
- `hasResumeDraftContent` must also count `summary` and `links`.

### 5. Merge (`resume-profile-draft.ts`)

- Add `summary: string` and `links: CandidateLink[]` to `CandidateProfileDraft`.
- `mergeResumeDraft`: `summary = current.summary.trim() || draft.summary ?? ""`;
  merge `links` via the existing `mergeEntries` (dedupe by normalized `label|url`),
  same 12-entry cap and `added`/`skipped` accounting.

### 6. Form + i18n (`candidate-profile-form.tsx`, 6 locale files)

- Add `summary` textarea (near headline) and a `links` repeater
  (`label` + `url` fields, add/remove like other sections).
- Hidden inputs: `summary` (text) and `links` (JSON) so the server action
  receives them unchanged.
- Add both to `profileEssentials` (summary, links) and completion copy.
- `importStatus`/`ResumeImportError`: add `"legacyDoc"` (and keep `unsupported`
  for unknown extensions).
- Update `<input accept>` to `.pdf,.docx,.rtf,.odt,.txt,.md` with MIME types.
- Update the `resumeImport.fileHint` and `unsupported` copy to name the expanded
  set, and add a `resumeImport.errors.legacyDoc` message — **in all six locales**
  (`src/messages/{tr,en,ru,el,fa,de}.json`), keeping `tr`/`en` key shapes equal
  (a `check-frontend-source` gate) and translating (Russian/Greek/Persian/German
  must not stay Turkish/English — message-catalogs checks legal/district copy, and
  next-intl requires the key to exist in every locale).

### 7. Format extraction (`text-document-extractor.ts` + new modules)

- New `src/features/documents/rtf-text-decoder.ts` (pure TS, no deps):
  RTF control-word parser — skip font/color/tables-of-content, decode
  `\par`/`\line`→newline, `\tab`, `\'hh` (honour `\ansicpg` 1252/1254/1251),
  `\uN` with `\uc` fallback, strip unknown groups. Guard output to
  `maxExtractedCharacters`.
- New `src/features/documents/odt-text-extractor.ts` (uses `fflate`):
  unzip → read `content.xml` → strip tags, decode the four XML entities, insert
  newlines on `</text:p>` / `</text:h>` / table-row boundaries. Guard length.
- `extractDocxText`: keep `mammoth extractRawText` but normalize tabs to ` | `
  so the tabular-CV patterns in the parser fire for Word table layouts.
- `extractPdfText`: sort `content.items` into reading order before concatenating
  — cluster x-positions into columns and emit top-to-bottom (descending `transform`
  y), left-to-right within a row, inserting a newline when the row/column changes.
  Fixes the "multi-column PDF interleave" root cause. Keep `hasEOL` as a fallback.
- `extractTextDocument` dispatch: add `rtf`, `odt`; keep txt/md; add a
  `doc` branch returning `DocumentImportError("legacyDoc")`. Reject other
  extensions with `unsupported` (unchanged).
- Keep limits (5 MB, 25 PDF pages, 80k chars) and the `%PDF-`/ZIP signature
  checks.

### 8. Tests + guards

- `tests/unit/document-import.test.ts`: replace the `.rtf → unsupported`
  assertion with `.doc → legacyDoc`; add RTF + ODT fixture tests (decode known
  content), and `.rtf`/`.odt` happy paths.
- New/updated parser unit tests (`tests/unit/resume-parser*.test.ts` or adjacent
  `src/features/candidates/*.test.ts`): summary extraction from Turkish/English
  headings; links extraction + normalization + dedupe; regression that email/phone
  still reach no field and are **not** in `links`; multi-column PDF text no longer
  interleaves experience fields.
- Schema/merge tests for `summary` + `links` (bounds, dedupe, added/skipped).
- `bun run check:frontend-source` and `tests/security/client-boundary.test.ts`
  must stay green: new client modules import no `@/server`, read no non-public
  env, and the summary/links code uses no `dangerouslySetInnerHTML`/external CDN.
- Do not introduce new `public` functions (no
  `supabase/tests/database/function_privileges.test.sql` change). If any
  `supabase/tests/database/*` ratchet lists `candidate_profiles` column grants,
  update it to include `summary`/`links`.

---

## Validation (run in this order)

- `bun run lint`
- `bun run typecheck`
- `bun run check:frontend-source`
- `bun run test:unit`
- `bun run test:security`
- `bun run test:db` (pgTAP; new columns/grants)
- Build + E2E with a throwaway `NEXT_DIST_DIR` (per AGENTS.md), then
  `git checkout -- tsconfig.json next-env.d.ts`:
  - `NEXT_DIST_DIR=.next-cv bun run build`
  - `bun run test:e2e`
- Manual smoke: import one PDF, one DOCX, one RTF, one ODT; confirm summary +
  links land as suggestions, edit, Save; confirm `.doc` shows the new message.

## Risks / notes

- **RTF/ODT fidelity** is heuristic (like the existing PDF/DOCX path): target is
  complete *plain-text* recovery, not layout-perfect round-trip. Cover with
  fixture tests that pin extracted text.
- **`profile`/`profil` heading ambiguity**: a CV "Profile" section sometimes
  holds name+email rather than a summary. Contact lines are still filtered, so the
  worst case is an empty/wrong `summary` suggestion the user edits — never leaked
  PII. Acceptable; no new privacy surface since email/phone are never written.
- **New dependency `fflate`** is bundled (no CDN) and must appear in
  `bun.lock`; verify `npm ci`-style installs via `bun`.