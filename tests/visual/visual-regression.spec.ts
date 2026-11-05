import { expect, test } from "@playwright/test";
import { expectVisualMatch, freezePage } from "./support/visual";
import { visualTargets } from "./targets";

/**
 * Visual regression for the critical screens, one test per target so a failure
 * names the exact surface and shards distribute the work evenly.
 *
 * Baselines are produced and compared with the production standalone server,
 * because that is what CI serves. Refresh them only after a deliberate design
 * change:
 *
 *   UPDATE_VISUAL_BASELINES=1 bun run test:visual
 */
for (const target of visualTargets) {
  test(`${target.name} matches its baseline — ${target.description}`, async ({
    page,
  }) => {
    // Software WebGL and the animated scenes make these captures load-sensitive
    // under a busy CI runner; a generous timeout is a determinism aid, not a way
    // to hide a diff (the comparison itself is exact and runs after the wait).
    test.setTimeout(120_000);
    await page.setViewportSize(target.viewport);
    await page.goto(target.route, { waitUntil: "networkidle" });
    await freezePage(page);

    const locator = page.locator(target.selector).first();
    await expect(locator).toBeVisible();
    await expectVisualMatch(locator, target);
  });
}
