# Visual regression layer (`tests/visual/**`)

Pixel-level regression for the critical screens. `AGENTS.md` asks for a "no
visual change" claim to be proven with pixels — a Playwright `locator.screenshot`
at `deviceScaleFactor: 2` compared buffer-to-buffer with `sharp`. This directory
is that proof, in a runnable form.

Owned by **LANE-QA**. See `docs/lanes/08-qa.md` and `docs/lanes/AUDIT.md`.

## Why it exists

A styling change (a token edit, an accessibility fix, a layout tweak) can move
pixels without breaking a single behavioural assertion. The unit tests check
values, the E2E tests check behaviour; neither sees that the header border moved
one pixel or a card grew 4px. This layer diffs real renders against committed
baselines and fails when the change is larger than the allowance.

The method is the one recorded in `AGENTS.md`: the header accessibility fixes
were signed off as `0/343040` pixels changed, which is a fact because it was
measured, not asserted.

## How it runs

```bash
# 1. A production build on :3000 (the dev overlay is not the shipped UI).
NEXT_PUBLIC_APP_URL=http://localhost:3000 npm run build
cp -a .next/static/. .next/standalone/.next/static/
cp -a public/. .next/standalone/public/
HOSTNAME=0.0.0.0 PORT=3000 node .next/standalone/server.js

# 2. Verify (default) or (re)write the baselines.
npx tsx tests/visual/run-visual.ts            # compare, exit 1 on a regression
npx tsx tests/visual/run-visual.ts --update   # write baselines/<name>.png
```

`PLAYWRIGHT_BASE_URL` overrides the target (default `http://localhost:3000`).
A failing run writes `test-results/visual/<name>.actual.png` and
`<name>.diff.png` (changed pixels in red over a dimmed baseline).

> **Baselines are pinned to the CI runner, not to a workstation.** The baseline
> PNGs in this directory are the renders of the GitHub `ubuntu-24.04` runner
> (`google-chrome-stable`, CI's throwaway env), not of a local machine. The two
> environments rasterise the same webfonts differently — the same code, same
> Chrome build, and same committed baselines gave 12/12 shots failing on CI and
> 12/12 passing locally, on the *same* text-heavy crops. The runner's own render
> is byte-for-byte reproducible across runs, so it is the reference. Regenerate
> the baselines **from the runner** (see "Updating baselines"), never from a
> local build, or the next CI run will be red for a reason that is not a
> regression.

> **Not yet a required gate.** `package.json` and `.github/workflows/**` belong
> to LANE-INFRA. The layer is wired into the `E2E (1/4)` job as an **advisory**
> step (`continue-on-error`), which still runs all 12 shots, prints the table and
> uploads the diff images. It becomes required once the baselines match the
> runner — which is what the committed PNGs now do.

## The shots

`support/shots.ts` is the shot list: one entry per captured region, with the
route, the selector, the locale, the allowance and a note. It currently covers
12 shots:

| Group | Shots |
|---|---|
| Core screens | `home-search`, `jobs-card`, `job-detail-card`, `login-form`, `packages-lead` |
| Locale matrix | `header-{tr,en,ru,el,fa,de}` |
| RTL sample | `home-search-fa` |

The locale header row is where direction and overflow regressions surface first:
German is the longest label set and `fa` flips the row to RTL.

### Why element crops, not full pages

Each shot captures a region, not the whole document. Two reasons: a baseline stays
small, and it does not depend on how far the page happened to scroll. It also
keeps a fixed overlay (the cookie notice) out of most crops — the remaining
"settings" trigger is masked.

### Why these are deterministic

- `reducedMotion: "reduce"` is set on every context, so the reveal/tilt layer,
  the hero photo cycle and the vend scene's tour all take their static branch.
- Fonts are self-hosted through `next/font/google`, so glyph metrics do not
  depend on a network fetch at capture time.
- The consent notice is pre-answered with the `ib_consent=0:0` cookie; the small
  settings trigger that remains is masked.
- The 3D vend canvas is **not** captured: its frame timing is load-dependent
  (`docs/performance-budget.md`), so a diff there would be noise. It has its own
  behavioural specs.

Measured: repeated captures of every shot are `0` pixels different, except the
header row. The header has `backdrop-filter: blur()` over the hero photo and the
compositor rounds the blurred backdrop by a **max channel delta of 2** between
runs (~2% of pixels at zero tolerance, `0%` at tolerance 12). The per-channel
tolerance absorbs it; without the tolerance the header shot would flake.

## Thresholds

`defaultMaxDiffPixelRatio` is `0.002` (0.2%, Playwright's own default) and
`defaultChannelTolerance` is `12`. The tolerance absorbs sub-pixel text
antialiasing drift, which otherwise flags every glyph edge on some runs. A shot
can override either on its `VisualShot` entry.

A **dimension change** (the element grew or shrank) is always a hard failure — a
`2528x1716` vs `2560x134` header is not "1% of pixels", it is a layout break.

## Updating baselines

A baseline is a reviewed artifact. To change one deliberately:

1. Run the runner against the new build and read the `diff` column. A change you
   meant to make shows up as a bounded, explainable diff on the shots you
   touched — and **only** those shots.
2. Run `npx tsx tests/visual/run-visual.ts --update`.
3. Commit the changed PNGs in the same PR as the change, and say in the PR body
   which shots moved and why.
4. Re-run the verify mode to confirm the tree is green.

Never widen `defaultMaxDiffPixelRatio` to silence a real change; fix the render or
update the baseline with a reason.

### Regenerating for the runner (the normal case)

Because the committed baselines are the runner's renders, the authoritative
`--update` runs **on the runner**. When a real, intended UI change needs new
baselines, read them out of the CI artifacts rather than writing them locally:

1. Push the change; the advisory `Visual regression` step fails and uploads
   `visual-regression-artifacts` (the `*.actual.png` for every shot).
2. Download the artifact and copy each `*.actual.png` over
   `tests/visual/baselines/<name>.png`.
3. Confirm the copy is the render you meant: `diffRgba(ci, newBaseline, 12)`
   must be `0`, and the dimensions must be unchanged unless the layout changed.
4. Commit the PNGs. The next CI run is green, and a *later* unintended change is
   now caught against a reference the runner actually produces.

The runner render was verified byte-for-byte reproducible across two independent
CI runs before it was adopted (issue #210), which is what makes step 3 a real
check rather than a hope.

## Files

| File | What it does |
|---|---|
| `support/shots.ts` | The shot list and the default thresholds. Not a test file. |
| `support/image-diff.ts` | RGBA decode, tolerance diff, red-over-dim diff render, baseline I/O. |
| `run-visual.ts` | The browser runner: capture, diff, report, exit code. |
| `baselines/*.png` | The committed reference renders. |
| `../../tests/unit/visual-image-diff.test.ts` | Unit coverage for the diff arithmetic, in the fast gate. |

## Rules

- Baselines are captured from a **production** build, never `next dev`.
- A shot must be deterministic; if a region cannot be made deterministic, mask it
  and say why on the `VisualShot` entry.
- Do not loosen a threshold to make a regression pass.
- A new shot needs a reason it is on the critical path, in the entry's `note`.
