import { expect, test } from "@playwright/test";

test("anonymous visitors cannot see the admin package console", async ({
  page,
}) => {
  await page.goto("/admin/packages");

  await expect(
    page.getByRole("heading", { name: "Job entitlement management" }),
  ).toHaveCount(0);
  await expect(page.locator(".admin-package-form")).toHaveCount(0);
});
