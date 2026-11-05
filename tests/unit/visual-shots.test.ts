import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import {
  defaultChannelTolerance,
  defaultMaxDiffPixelRatio,
  localePrefix,
  visualShots,
} from "../visual/support/shots";

/**
 * The shot list and the committed baselines are two hand-maintained sets that
 * have to agree, and nothing checked that they did. The browser runner that
 * would notice is CI-**advisory** (`continue-on-error` in `ci.yml`), so a shot
 * added without a baseline — or a baseline left behind after a shot is renamed —
 * was invisible to every gate that can fail a merge. That is the same silent
 * drift the visual layer exists to catch, one level up.
 *
 * These assertions run in the fast unit gate, so the two sets cannot diverge
 * without a red check. The rules are the ones the runner assumes:
 *   - every shot resolves to a baseline file, and every baseline to a shot;
 *   - names are unique (the name is the baseline file name);
 *   - the route matches the locale (`tr` is unprefixed, the rest carry a prefix);
 *   - the thresholds may only stay or shrink, never widen to silence a change.
 */

const baselinesDirectory = new URL("../visual/baselines/", import.meta.url);
const locales = ["tr", "en", "ru", "el", "fa", "de"];

function baselineNames(): string[] {
  return readdirSync(baselinesDirectory)
    .filter((file) => file.endsWith(".png"))
    .map((file) => file.replace(/\.png$/, ""))
    .sort();
}

test("every shot has a committed baseline and every baseline a shot", () => {
  const shots = visualShots.map((shot) => shot.name).sort();
  const baselines = baselineNames();

  const withoutBaseline = shots.filter((name) => !baselines.includes(name));
  const orphaned = baselines.filter((name) => !shots.includes(name));

  assert.deepEqual(
    withoutBaseline,
    [],
    `shots with no baseline at tests/visual/baselines/<name>.png: ${withoutBaseline.join(", ")}`,
  );
  assert.deepEqual(
    orphaned,
    [],
    `baselines with no shot in support/shots.ts (rename or delete them): ${orphaned.join(", ")}`,
  );
});

test("shot names are unique, because the name is the baseline file name", () => {
  const names = visualShots.map((shot) => shot.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(duplicates, [], `duplicate shot names: ${duplicates.join(", ")}`);
});

test("every shot is complete and its locale is one the site ships", () => {
  for (const shot of visualShots) {
    assert.ok(shot.name.trim(), "a shot needs a name");
    assert.ok(shot.selector.trim(), `${shot.name} needs a selector`);
    assert.ok(shot.note.trim(), `${shot.name} needs a note for the PR table`);
    assert.ok(
      locales.includes(shot.locale),
      `${shot.name} has locale "${shot.locale}", which is not a shipped locale`,
    );
  }
});

test("a shot's route carries exactly its locale's prefix", () => {
  for (const shot of visualShots) {
    const prefix = localePrefix(shot.locale);
    assert.ok(shot.path.startsWith("/"), `${shot.name} path must be absolute: ${shot.path}`);

    if (prefix === "") {
      // The default locale is unprefixed: it must not accidentally carry a prefix.
      assert.equal(
        /^\/(en|ru|el|fa|de)(\/|$)/.test(shot.path),
        false,
        `${shot.name} is the default locale but its path is prefixed: ${shot.path}`,
      );
    } else {
      assert.ok(
        shot.path === prefix || shot.path.startsWith(`${prefix}/`),
        `${shot.name} (${shot.locale}) path "${shot.path}" does not start with "${prefix}"`,
      );
    }
  }
});

test("the diff thresholds may only stay or shrink, never widen", () => {
  // A ratchet, not a snapshot: widening either value is how a real regression is
  // silenced, so the ceiling is the documented default. Lowering it is fine.
  assert.ok(
    defaultMaxDiffPixelRatio <= 0.002,
    `defaultMaxDiffPixelRatio widened to ${defaultMaxDiffPixelRatio}; fix the render instead`,
  );
  assert.ok(
    defaultChannelTolerance <= 12,
    `defaultChannelTolerance widened to ${defaultChannelTolerance}; fix the render instead`,
  );

  // A per-shot override must not be looser than the default it replaces.
  for (const shot of visualShots) {
    if (shot.maxDiffPixelRatio !== undefined) {
      assert.ok(
        shot.maxDiffPixelRatio <= defaultMaxDiffPixelRatio,
        `${shot.name} loosens maxDiffPixelRatio to ${shot.maxDiffPixelRatio}`,
      );
    }
    if (shot.channelTolerance !== undefined) {
      assert.ok(
        shot.channelTolerance <= defaultChannelTolerance,
        `${shot.name} loosens channelTolerance to ${shot.channelTolerance}`,
      );
    }
  }
});
