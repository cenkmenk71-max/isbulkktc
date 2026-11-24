import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("public auth pages redirect existing sessions without requiring a session", () => {
  const register = source("src/app/[locale]/(auth)/register/page.tsx");
  const forgotPassword = source(
    "src/app/[locale]/(auth)/forgot-password/page.tsx",
  );
  const resetPassword = source(
    "src/app/[locale]/(auth)/reset-password/page.tsx",
  );

  for (const page of [register, forgotPassword, resetPassword]) {
    assert.doesNotMatch(page, /requireAuthenticatedUser/);
    assert.match(page, /getCurrentUser|getSignedInAuthDestination/);
  }
  assert.match(register, /getSignedInAuthDestination/);
  assert.match(forgotPassword, /getSignedInAuthDestination/);
  assert.match(resetPassword, /redirectLocalized\("\/forgot-password\?error=expired"\)/);
});

test("protected pages guard the session and company resource at page level", () => {
  const routes = [
    source("src/app/[locale]/(company)/company/dashboard/page.tsx"),
    source("src/app/[locale]/(company)/company/jobs/page.tsx"),
    source("src/app/[locale]/(company)/company/jobs/new/page.tsx"),
    source("src/app/[locale]/(company)/company/jobs/[jobId]/edit/page.tsx"),
    source(
      "src/app/[locale]/(company)/company/dashboard/applications/[applicationId]/page.tsx",
    ),
    source("src/app/[locale]/(candidate)/profile/dashboard/page.tsx"),
  ];

  for (const route of routes) {
    assert.match(route, /requireAuthenticatedUser/);
  }
  assert.match(routes[0], /query\.company && company\.id !== query\.company/);
  assert.match(routes[1], /query\.company && company\.id !== query\.company/);
  assert.match(routes[2], /query\.company && company\.id !== query\.company/);
  assert.match(routes[3], /isJobCompanyMember\(company\.id\)/);
  assert.match(routes[3], /if \(!job\) notFound\(\)/);
  assert.match(routes[4], /getCompanyApplications/);
  assert.match(routes[4], /if \(!application\) notFound\(\)/);
});

test("admin pages check the platform role before loading admin data", () => {
  const companyReviews = source(
    "src/app/[locale]/(admin)/admin/company-profiles/page.tsx",
  );
  const content = source("src/app/[locale]/(admin)/admin/content/page.tsx");
  assert.match(companyReviews, /requirePlatformRole\("platform_admin"\)/);
  assert.match(content, /requireAuthenticatedUser/);
  assert.match(content, /hasAssignedPlatformRole\("platform_admin"\)/);
});

test("company registration redirects owners to their existing workspace", () => {
  const page = source("src/app/[locale]/(company)/company/new/page.tsx");
  assert.match(page, /hasActiveCompanyOwnership\(user\.id\)/);
  assert.match(page, /redirectLocalized\("\/company\/dashboard"\)/);
});
