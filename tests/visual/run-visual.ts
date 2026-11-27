/**
 * Visual-regression runner.
 *
 * Captures the regions in `support/shots.ts` at device resolution and diffs the
 * raw pixels against the committed baselines with `sharp`. This is the method
 * `AGENTS.md` prescribes for a "no visual change" claim: a Playwright
 * `locator.screenshot` at `deviceScaleFactor: 2`, compared buffer-to-buffer, so
 * the result is a pixel count rather than an opinion.
 *
 * Usage:
 *   tsx tests/visual/run-visual.ts              # verify against baselines
 *   tsx tests/visual/run-visual.ts --update     # (re)write the baselines
 *
 * The target is `PLAYWRIGHT_BASE_URL` (default http://localhost:3000). It must
 * be a running production build: the dev overlay is a fixed element that lands
 * inside tall crops and is not part of the shipped UI.
 *
 * Wired into the `E2E (1/4)` CI job as an advisory step (`continue-on-error`);
 * it becomes required once the committed baselines match the runner. See
 * `tests/visual/README.md`.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import sharp from "sharp";
import {
  defaultChannelTolerance,
  defaultMaxDiffPixelRatio,
  type VisualShot,
  visualShots,
} from "./support/shots";
import {
  diffRgba,
  readBaseline,
  renderDiff,
  toRgba,
  writeBaseline,
  writeArtifact,
} from "./support/image-diff";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDirectory = path.join(here, "baselines");
const artifactDirectory = path.join(process.cwd(), "test-results", "visual");

const update = process.argv.includes("--update");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const viewport = { width: 1280, height: 900 };
const deviceScaleFactor = 2;

// A visitor who has already answered the cookie notice. The notice itself is a
// fixed overlay with its own E2E spec; keeping it out of these crops removes a
// bottom-of-viewport element from regions that scroll past it. The small
// "settings" trigger that remains is masked in the screenshot.
const decidedConsentCookie = {
  name: "ib_consent",
  value: "0:0",
  url: baseURL,
};

async function capture(browser: Browser, shot: VisualShot): Promise<Buffer> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    // The reveal/tilt layer and the hero photo cycle all defer to this, so the
    // captured frame is the static one the accessibility suite also asserts.
    reducedMotion: "reduce",
  });
  await context.addCookies([decidedConsentCookie]);
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}${shot.path}`, { waitUntil: "load" });
    // A short, bounded network-idle wait: analytics beacons keep a connection
    // open indefinitely, so the default 30s timeout would stall every shot.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    // Fonts and images settle after `load`; without this the first capture of a
    // run can differ from the second by a glyph width. The image wait is bounded:
    // below-the-fold lazy images never fire `load`, so awaiting them all would
    // hang. The regions captured here are above or near the fold, so a short cap
    // is enough for their images to decode.
    //
    // `img.decode()` matters as much as `load`: the header uses `backdrop-filter`
    // over the hero photo, so a photo that has loaded but not decoded paints a
    // flat backdrop and moves ~2% of the header's pixels. Awaiting decode pins
    // the bitmap before the screenshot.
    await page.evaluate(async () => {
      const ready = Array.from(document.images).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        }
        if (image.complete && image.naturalWidth > 0) {
          await image.decode().catch(() => {});
        }
      });
      await Promise.race([
        Promise.all([document.fonts.ready, ...ready]),
        new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
      ]);
    });

    const target = page.locator(shot.selector).first();
    await target.waitFor({ state: "visible", timeout: 30_000 });
    await target.scrollIntoViewIfNeeded();

    // Fixed bottom-corner widgets are present on every page, so they are masked
    // like the consent trigger rather than baked into the region baselines.
    const maskSelectors = [
      ".consent-settings-trigger",
      ".support-widget__launcher",
      ...(shot.maskSelectors ?? []),
    ];
    return await target.screenshot({
      mask: maskSelectors.map((selector) => page.locator(selector)),
    });
  } finally {
    await context.close();
  }
}

type Outcome = {
  shot: VisualShot;
  status: "pass" | "fail" | "created" | "missing";
  ratio?: number;
  diffPixels?: number;
  totalPixels?: number;
  detail?: string;
};

async function runShot(browser: Browser, shot: VisualShot): Promise<Outcome> {
  const baselinePath = path.join(baselineDirectory, `${shot.name}.png`);
  const actual = await capture(browser, shot);

  if (update) {
    await writeBaseline(baselinePath, actual);
    return { shot, status: "created" };
  }

  let baseline;
  try {
    baseline = await readBaseline(baselinePath);
  } catch {
    await writeArtifact(path.join(artifactDirectory, `${shot.name}.actual.png`), actual);
    return {
      shot,
      status: "missing",
      detail: `no baseline at tests/visual/baselines/${shot.name}.png — run with --update`,
    };
  }

  const actualRgba = await toRgba(actual);
  const tolerance = shot.channelTolerance ?? defaultChannelTolerance;
  const allowance = shot.maxDiffPixelRatio ?? defaultMaxDiffPixelRatio;

  // Written on every failure so a reviewer can compare actual vs baseline vs
  // diff without re-running the suite.
  const writeFailureArtifacts = async (diffPng?: Buffer) => {
    await Promise.all([
      writeArtifact(path.join(artifactDirectory, `${shot.name}.actual.png`), actual),
      writeArtifact(
        path.join(artifactDirectory, `${shot.name}.baseline.png`),
        await sharp(baseline.data, {
          raw: { width: baseline.width, height: baseline.height, channels: 4 },
        })
          .png()
          .toBuffer(),
      ),
      ...(diffPng
        ? [writeArtifact(path.join(artifactDirectory, `${shot.name}.diff.png`), diffPng)]
        : []),
    ]);
  };

  let diff;
  try {
    diff = diffRgba(actualRgba, baseline, tolerance);
  } catch (error) {
    await writeFailureArtifacts();
    return {
      shot,
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (diff.ratio <= allowance) {
    return {
      shot,
      status: "pass",
      ratio: diff.ratio,
      diffPixels: diff.diffPixels,
      totalPixels: diff.totalPixels,
    };
  }

  await writeFailureArtifacts(await renderDiff(actualRgba, baseline, tolerance));

  return {
    shot,
    status: "fail",
    ratio: diff.ratio,
    diffPixels: diff.diffPixels,
    totalPixels: diff.totalPixels,
    detail: `${diff.diffPixels}/${diff.totalPixels} px (${(diff.ratio * 100).toFixed(3)}%) > ${(allowance * 100).toFixed(3)}%`,
  };
}

function printReport(outcomes: Outcome[]): void {
  console.log("");
  console.log(`Visual regression — ${baseURL} @ ${viewport.width}x${viewport.height} DPR${deviceScaleFactor}`);
  console.log(
    `mode: ${update ? "update (baselines written)" : "verify"} — ${outcomes.length} shots`,
  );
  console.log("");
  console.log(
    `${"shot".padEnd(20)}${"locale".padEnd(8)}${"result".padEnd(9)}diff`,
  );
  for (const outcome of outcomes) {
    const diff =
      outcome.ratio === undefined
        ? (outcome.detail ?? "")
        : `${(outcome.ratio * 100).toFixed(3)}% (${outcome.diffPixels}px)`;
    console.log(
      `${outcome.shot.name.padEnd(20)}${outcome.shot.locale.padEnd(8)}${outcome.status.padEnd(9)}${diff}`,
    );
  }
  console.log("");
}

async function main(): Promise<void> {
  await mkdir(baselineDirectory, { recursive: true });

  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });

  const outcomes: Outcome[] = [];
  try {
    for (const shot of visualShots) {
      try {
        outcomes.push(await runShot(browser, shot));
      } catch (error) {
        outcomes.push({
          shot,
          status: "fail",
          detail: error instanceof Error ? error.message.split("\n")[0] : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  printReport(outcomes);

  const failures = outcomes.filter(
    (outcome) => outcome.status === "fail" || outcome.status === "missing",
  );
  if (failures.length > 0) {
    console.log(
      `FAIL — ${failures.length}/${outcomes.length} shots changed. Artifacts in test-results/visual/.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`PASS — ${outcomes.length}/${outcomes.length} shots match their baselines.`);
}

await main();
