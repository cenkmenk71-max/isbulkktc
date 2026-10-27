import { expect, test } from "@playwright/test";

test("anonymous visitors can load a valid public job search response", async ({
  page,
}) => {
  await page.goto("/tr/jobs?query=playwright-no-match-8f2c91");

  await expect(
    page.getByRole("heading", { name: "Yayındaki iş ilanları" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Şu anda eşleşen yayında ilan yok",
    }),
  ).toBeVisible();
  await expect(page.getByText("0 ilan bulundu")).toBeVisible();
});

test("jobs navigation opens an accessible listing page with working filter controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tr/jobs?district=not-a-district");

  await expect(page).toHaveTitle(/Kuzey Kıbrıs güncel iş ilanları/);
  await expect(
    page.getByRole("heading", { name: "Sıradaki işinizi bulun." }),
  ).toBeVisible();
  await expect(page.locator("main#main main")).toHaveCount(0);
  await expect(page.locator(".jobs-filter-error")).toContainText(
    "Arama filtreleri geçersiz.",
  );
  await expect(page.locator(".jobs-card-source")).toHaveCount(0);
  await expect(page.locator(".company-job-employer-sources")).toHaveCount(0);

  const jobsLink = page
    .getByRole("navigation", { name: "Ana gezinme" })
    .getByRole("link", { name: "İş İlanları" });
  await expect(jobsLink).toHaveAttribute("href", "/jobs");
  await expect(jobsLink).toHaveAttribute("aria-current", "page");

  await expect(page.getByRole("searchbox", { name: "Pozisyon veya şirket" })).toBeVisible();
  await expect(page.getByLabel("Konum")).toBeVisible();
  await expect(page.getByLabel("Çalışma türü")).toBeVisible();
  await expect(page.getByLabel("Çalışma düzeni")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "İlanları ara" }),
  ).toBeVisible();

  await page.getByLabel("Çalışma türü").selectOption("full_time");
  await page.getByRole("button", { name: "İlanları ara" }).click();
  await expect(page).toHaveURL(/\/jobs\?.*jobType=full_time/);
  await expect(page.locator(".jobs-filter-error")).toHaveCount(0);
  await expect(page.getByLabel("Çalışma türü")).toHaveValue("full_time");
  await expect(page.locator(".jobs-results")).toBeVisible();
  await expect(page.locator(".jobs-details-link").first()).toBeVisible();
  await expect(page.locator(".jobs-details-link").first()).toHaveCSS(
    "min-height",
    "44px",
  );

  await expect(page.locator("aside.jobs-source-note")).toHaveCount(0);
  await expect(
    page.locator(
      'a[href="https://www.iskibris.com/jobs"], a[href="https://isbulkibris.com/jobs"]',
    ),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await expect(
    page
      .locator("#mobile-primary-navigation")
      .getByRole("link", { name: "İş İlanları" }),
  ).toHaveAttribute("aria-current", "page");
});

test("source employer details stay separate and link back to their public source", async ({
  page,
}) => {
  await page.goto("/tr/companies");
  await expect(page.getByText("İşKıbrıs")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Four Vision Development Ltd." }),
  ).toBeVisible();

  const employerCard = page
    .locator(".company-job-employer-card")
    .filter({ hasText: "Fikri & Co Chartered Accountants" });
  await expect(employerCard).toBeVisible();
  await expect(employerCard).toContainText("Muhasebe & Denetim");
  await expect(employerCard).toContainText("Lefkoşa");
  await expect(
    employerCard.locator(
      'a[href="https://www.fikrico.com/"][target="_blank"]',
    ),
  ).toBeVisible();
  await expect(
    employerCard.locator(
      'a[href="https://isbulkibris.com/firmalar/fikri-co-chartered-accountants"]',
    ),
  ).toBeVisible();
  await expect(
    employerCard.locator(".company-job-employer-sources"),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Bu bölümde görünmek, şirketin İşBul KKTC tarafından doğrulandığı anlamına gelmez.",
    ),
  ).toBeVisible();

  await page.goto("/tr/jobs?query=Garson");
  await expect(
    page.getByRole("link", { name: "Garson", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".jobs-card-source")).toHaveCount(0);
  await expect(page.getByText("İşKıbrıs")).toHaveCount(0);

  await page.goto("/tr/jobs/source-iskibris-garson");
  await expect(page.getByRole("heading", { name: "Garson" })).toBeVisible();
  await expect(page.getByText("İşKıbrıs")).toHaveCount(0);
  await expect(page.locator(".jobs-source-note")).toHaveCount(0);
  await expect(page.locator(".jobs-source-application-note")).toHaveCount(0);
  await expect(
    page.locator('.job-detail-aside a[href^="https://"]'),
  ).toHaveCount(0);

  await page.goto("/tr/jobs/source-isbulkibris-muhasebe-denetim-personeli");
  await expect(
    page.getByRole("heading", { name: "Muhasebe ve Denetim Personeli" }),
  ).toBeVisible();
  await expect(page.getByText("İşKıbrıs")).toHaveCount(0);
  await expect(page.getByText("1979’da kurulan, ICAEW üyesi muhasebe ve denetim firması.")).toBeVisible();
  await expect(
    page.locator(".jobs-source-note, .jobs-source-application-note"),
  ).toHaveCount(0);
  await expect(
    page.locator('.job-detail-aside a[href^="https://"]'),
  ).toHaveCount(0);
});
