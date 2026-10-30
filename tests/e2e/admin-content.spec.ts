import { expect, test } from "@playwright/test";

/**
 * The managed-content console mirrors the package console: an anonymous visitor
 * must never see the editor, and the page must not leak the admin-only RPC
 * output. A signed-in platform administrator without a verified TOTP factor is
 * stopped by the MFA gate before any content loads.
 */
test("anonymous visitors cannot reach the managed-content console", async ({
  page,
}) => {
  await page.goto("/admin/content");

  await expect(
    page.getByRole("heading", { name: "Published content management" }),
  ).toHaveCount(0);
  await expect(page.locator(".admin-content-form")).toHaveCount(0);
  await expect(page.locator(".admin-package-form")).toHaveCount(0);
});

test("the console is not linked from the public header", async ({ page }) => {
  await page.goto("/tr");

  await expect(page.locator('a[href$="/admin/content"]')).toHaveCount(0);
});
