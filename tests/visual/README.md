# Visual regression layer (`tests/visual/**`)

Pixel-level regression for the critical screens, so a "no visual change" claim
is a measurement rather than an assertion. The approach is the one AGENTS.md
already validated for the accessibility fixes (Playwright `locator.screenshot`
at `deviceScaleFactor: 2` diffed with `sharp`); this directory turns it into a
runnable suite with committed baselines.

Owned by **LANE-QA**. See `docs/lanes/08-qa.md` and `docs/lanes/AUDIT.md`.

## What it guards

`targets.ts` lists every baseline. Each is an **element** capture — not a
full-page shot — so a change below the fold cannot move the target and the
reference stays small enough to commit (16 targets, ~2.7 MB total):

| Area | Targets |
|---|---|
| Home hero copy | one per locale (`tr`, `en`, `ru`, `el`, `fa`, `de`) + one at 390px |
| Shared layout | home job-search form, site footer |
| Jobs | listing filter panel, first result card |
| Job detail | header and apply aside for the seeded `source-iskibris-garson` |
| Account | sign-in form and OAuth providers |
| Packages | package catalogue grid |
| Errors | 404 page |

The per-locale hero captures are deliberate: a font, RTL or wrapping regression
is attributable to one locale instead of collapsing into a single "the hero
changed" failure.

## How it runs

The suite has its own Playwright config so it can be invoked on its own. It runs
against the **production standalone server**, the same artefact the E2E suite
uses in CI:

```bash
bun run build
mkdir -p .next/standalone/.next .next/standalone/public
cp -a .next/static/. .next/standalone/.next/static/
cp -a public/. .next/standalone/public/
bun run test:visual
```

Because the job-detail and jobs targets read seeded rows, the local Supabase
stack must be up (`bun run db:start`) — exactly the precondition the E2E suite
already has in CI.

> **Do not baseline against `next dev`.** The dev server and the built output do
> not render identically: four of the sixteen targets (the search form, the
> footer, the first job card and the sign-in form) differed by 0.4-1.3% between
> the two — far over the 0.1% budget. Baselines are captured from the production
> build. Point `PLAYWRIGHT_BASE_URL` at a server already running that build to
> compare against it without the config's own `webServer`.

## Determinism

A flaky visual test is worse than none, so the harness removes every source of
variation it can before capturing (`support/visual.ts`):

- motion is frozen (animation/transition disabled, `reducedMotion: reduce`);
- webfonts are awaited via `document.fonts.ready`;
- the cookie notice and its fixed settings trigger are hidden — both overlap the
  footer and the first job card depending on scroll position.

Measured across repeated renders of all 16 targets, the natural diff was
**0.0000%**. The freeze CSS is injected **after** `page.goto`: an injected
`<style>` belongs to the current document, so adding it before navigation is
discarded with the previous page and the freeze silently does not apply.

## Threshold

A pixel counts as changed when an RGB channel moves by more than 26/255 (~10%),
and the test fails when more than **0.1%** of pixels changed — or when the
geometry changed at all (a resized element is a regression, not noise).

Calibration (measured on the hero-copy target):

| Change | Diff |
|---|---:|
| repeated render (noise floor) | 0.0000% |
| one-pixel shift | 9.8% |
| heading colour change | 6.8% |
| 2px padding change | 6.2% |
| font-size +1px | 33.8% |
| 3px shift | 16.6% |

The smallest deliberate change (6.2%) is ~60× the 0.1% budget, and the noise
floor is 0%, so the threshold catches real changes without flaking.

## Updating a baseline

A missing baseline **fails** the test with the command to create it, so an
unwritten reference can never pass silently. After a deliberate design change:

```bash
UPDATE_VISUAL_BASELINES=1 bun run test:visual
```

Then review the changed PNGs in the diff and commit them. A failing run writes
`<name>.actual.png` and `<name>.diff.png` under `test-results/visual/` and
attaches them to the report, so the change can be inspected without re-running.

## Wiring status

`bun run test:visual` needs a `test:visual` script in `package.json`, which
belongs to **LANE-INFRA** (`package.json`, `.github/workflows/**`). Until it is
added, run the suite through the config directly:

```bash
node node_modules/@playwright/test/cli.js test --config tests/visual/playwright.config.ts
```

The `test:unit` job already picks up `tests/unit/visual-comparison.test.ts`,
which pins the comparison metric (noise floor, sensitivity, geometry mismatch)
without a browser.
