import { expect, test, type APIRequestContext } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocalStack = /(127\\.0\\.0\\.1|localhost|\\[::1\\])/.test(supabaseUrl);

const serviceHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function createConfirmedEmployer(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: serviceHeaders,
    data: {
      email,
      password: "Employer-pass-2026",
      email_confirm: true,
      user_metadata: { locale: "en", display_name: "E2E Employer" },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function deleteUser(request: APIRequestContext, id: string): Promise<void> {
  const response = await request.delete(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    headers: serviceHeaders,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("anonymous visitors cannot open employer job management or admin moderation", async ({
  page,
}) => {
  await page.goto("/en/company/jobs");
  await expect(page).toHaveURL(/\\/en\\/login\\?audience=employer/);
  await expect(page.locator(".employer-jobs-page")).toHaveCount(0);

  await page.goto("/en/admin/jobs");
  await expect(page.locator(".admin-job-review-page")).toHaveCount(0);
});

test("an employer can create and submit a listing using the current form values", async ({
  page,
  request,
}) => {
  test.skip(
    !isLocalStack || !serviceRoleKey,
    "The employer job-management E2E needs the local Supabase stack and service-role key.",
  );
  test.setTimeout(120_000);

  const stamp = Date.now();
  const email = `e2e-job-employer-${stamp}@example.com`;
  const companyName = `E2E Employer ${stamp}`;
  const jobTitle = `E2E Operations Manager ${stamp}`;
  let userId: string | null = null;
  let companyId: string | null = null;

  try {
    userId = await createConfirmedEmployer(request, email);

    await page.goto("/en/login?audience=employer");
    await page.getByLabel("Account email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Employer-pass-2026");
    await page.getByRole("button", { name: "Employer sign in" }).click();
    await expect(page).toHaveURL(/\\/en\\/company\\/new/, { timeout: 20_000 });

    await page.getByLabel("Company name").fill(companyName);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page).toHaveURL(/\\/en\\/company\\/dashboard\\?company=/, {
      timeout: 20_000,
    });
    companyId = new URL(page.url()).searchParams.get("company");
    expect(companyId).toMatch(/^[0-9a-f-]{36}$/i);

    // The review RPC intentionally requires a verified employer. The local E2E
    // fixture grants that prerequisite through the service-role API only.
    const verification = await request.patch(
      `${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`,
      {
        headers: serviceHeaders,
        data: { verification_status: "verified" },
      },
    );
    expect(verification.ok(), await verification.text()).toBeTruthy();

    await page.goto(`/en/company/jobs?company=${companyId}`);
    await expect(
      page.getByRole("heading", { name: "My job listings" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Create a listing" }).click();
    await expect(page).toHaveURL(/\\/en\\/company\\/jobs\\/new/);

    await page.getByLabel("Job title").fill(jobTitle);
    await page.getByLabel("Listing URL slug").fill(`e2e-operations-manager-${stamp}`);
    await page
      .getByLabel("Short summary")
      .fill("Lead daily operations and improve measurable team outcomes.");
    await page
      .getByLabel("Job description")
      .fill(
        "Own operational planning, coordinate cross-functional teams, and deliver measurable improvements across the business.",
      );
    await page.getByLabel("Requirements").fill("At least five years of relevant experience.");
    await page
      .getByLabel("Responsibilities")
      .fill("Coordinate daily work, improve processes, and report outcomes.");
    await page.getByLabel("Employment type").selectOption("full_time");
    await page.getByLabel("Workplace model").selectOption("on_site");
    await page.getByLabel("District").selectOption("Lefkoşa");

    // Do not save first: this proves the submit button persists the latest
    // visible form values before changing the row to pending_review.
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Listing submitted for review.")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/en/company/jobs?company=${companyId}`);
    const listing = page.locator(".employer-job-card").filter({ hasText: jobTitle });
    await expect(listing).toBeVisible();
    await expect(listing).toContainText("In review");
    await expect(listing).toContainText(
      "Lead daily operations and improve measurable team outcomes.",
    );
    await expect(listing.getByRole("link", { name: "Edit listing" })).toHaveCount(0);
  } finally {
    if (companyId) {
      await request.delete(`${supabaseUrl}/rest/v1/jobs?company_id=eq.${companyId}`, {
        headers: serviceHeaders,
      });
      await request.delete(`${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`, {
        headers: serviceHeaders,
      });
    }
    if (userId) await deleteUser(request, userId);
  }
});
