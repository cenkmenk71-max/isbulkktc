import { expect, test } from "@playwright/test";

test("company directory limits location filtering to the six districts", async ({
  page,
}) => {
  await page.goto("/tr/companies");

  const districtFilter = page.getByLabel("İlçe");
  await expect(districtFilter.locator("option")).toHaveCount(7);
  await expect
    .poll(() =>
      districtFilter.locator("option").evaluateAll((options) =>
        options.map((option) => ({
          value: (option as HTMLOptionElement).value,
          label: option.textContent?.trim(),
        })),
      ),
    )
    .toEqual([
      { value: "", label: "Tüm ilçeler" },
      { value: "Lefkoşa", label: "Lefkoşa" },
      { value: "Mağusa", label: "Mağusa" },
      { value: "Girne", label: "Girne" },
      { value: "Güzelyurt", label: "Güzelyurt" },
      { value: "İskele", label: "İskele" },
      { value: "Lefke", label: "Lefke" },
    ]);

  await page
    .getByRole("searchbox", { name: "Şirket adı içinde ara" })
    .fill("2H Design");
  await expect(page.getByRole("heading", { name: "2H Design" })).toBeVisible();

  await districtFilter.selectOption("Girne");
  await expect(page.locator(".company-directory-location")).toContainText(
    "Girne",
  );

  await districtFilter.selectOption("Lefkoşa");
  await expect(
    page.getByRole("heading", { name: "Eşleşen şirket bulunamadı" }),
  ).toBeVisible();
});
