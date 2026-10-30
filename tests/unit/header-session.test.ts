import assert from "node:assert/strict";
import test from "node:test";

import {
  headerDashboardHrefs,
  resolveHeaderDashboardHref,
} from "../../src/features/identity/header-session";

test("employer owners land on the company dashboard from the header", () => {
  assert.equal(
    resolveHeaderDashboardHref(true),
    headerDashboardHrefs.employer,
  );
  assert.equal(headerDashboardHrefs.employer, "/company/dashboard");
});

test("everyone else lands on the candidate dashboard from the header", () => {
  assert.equal(
    resolveHeaderDashboardHref(false),
    headerDashboardHrefs.candidate,
  );
  assert.equal(headerDashboardHrefs.candidate, "/profile/dashboard");
});
