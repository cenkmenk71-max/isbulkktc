import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  fakeProfileRow,
  installBoundaryMocks,
  recorded,
  resetBoundary,
  type TableOutcome,
} from "./support/harness";

installBoundaryMocks();

/**
 * `getHeaderSession` — the session state the global header hydrates with.
 *
 * The header sits in the shared locale layout, so this action runs on nearly
 * every page, and its doc-comment states the contract explicitly: *fails closed —
 * any lookup problem reports the signed-out state rather than a broken header.*
 * The pure routing rule is pinned by `tests/unit/header-session.test.ts`, but the
 * action itself — the part that decides signed-in vs signed-out and queries the
 * employer membership — had no test at all. A regression here is invisible to the
 * unit layer and only shows up as a wrong dashboard link (or a blank header) in a
 * browser.
 *
 * The action body, `getCurrentUser` and the DAL all run as written.
 */

const ID = "00000000-0000-4000-8000-000000000001";

function headerSession() {
  return import("@/features/identity/header-session-actions");
}

function fromCalls(table: string) {
  return recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "from" }> =>
      call.kind === "from" && call.table === table,
  );
}

/** A signed-in, active visitor whose profile row loads normally. */
function signedInTables(
  companyMembers: TableOutcome = { data: null, error: null, count: 0 },
) {
  return {
    profiles: { data: fakeProfileRow(), error: null },
    company_members: companyMembers,
  };
}

test("a visitor with no session reports signed out and never reads the membership", async () => {
  resetBoundary({ user: undefined, tables: signedInTables() });
  const { getHeaderSession } = await headerSession();

  assert.deepEqual(await getHeaderSession(), { signedIn: false });
  assert.deepEqual(
    fromCalls("company_members"),
    [],
    "a signed-out header must not query employer membership",
  );
});

test("a suspended account reports signed out", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    tables: {
      profiles: { data: fakeProfileRow({ status: "suspended" }), error: null },
      company_members: { data: null, error: null, count: 1 },
    },
  });
  const { getHeaderSession } = await headerSession();

  assert.deepEqual(await getHeaderSession(), { signedIn: false });
  assert.deepEqual(fromCalls("company_members"), []);
});

test("an employer owner gets the company dashboard and their display name", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    tables: signedInTables({ data: null, error: null, count: 2 }),
  });
  const { getHeaderSession } = await headerSession();

  assert.deepEqual(await getHeaderSession(), {
    signedIn: true,
    displayName: "Ada Lovelace",
    dashboardHref: "/company/dashboard",
  });

  // The membership lookup must be scoped to the session user and to *owner*
  // membership: a recruiter (or another company's owner) must not land the
  // visitor on the employer dashboard.
  const [membership] = fromCalls("company_members");
  assert.ok(membership, "the membership lookup was not issued");
  assert.ok(membership.ops.some((op) => op === `eq:user_id="${ID}"`));
  assert.ok(membership.ops.includes("eq:membership_role=\"owner\""));
  assert.ok(membership.ops.includes("eq:status=\"active\""));
});

test("a candidate with no owner membership gets the candidate dashboard", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    tables: signedInTables({ data: null, error: null, count: 0 }),
  });
  const { getHeaderSession } = await headerSession();

  assert.deepEqual(await getHeaderSession(), {
    signedIn: true,
    displayName: "Ada Lovelace",
    dashboardHref: "/profile/dashboard",
  });
});

test("a failed membership lookup fails closed to the candidate dashboard", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    tables: signedInTables({ data: null, error: { code: "57014" }, count: null }),
  });
  const { getHeaderSession } = await headerSession();

  // Signed in (the session is valid) but the membership could not be read, so the
  // visitor is routed to the safe candidate dashboard rather than being denied a
  // header or handed the employer view on an unknown membership.
  assert.deepEqual(await getHeaderSession(), {
    signedIn: true,
    displayName: "Ada Lovelace",
    dashboardHref: "/profile/dashboard",
  });
});
