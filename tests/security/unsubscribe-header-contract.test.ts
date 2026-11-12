import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The `List-Unsubscribe` promise and the route that must keep it.
 *
 * `email-headers.ts` tells Gmail and Yahoo, in the message itself, that the
 * `List-Unsubscribe` URL accepts a one-click **POST**
 * (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`). The client acts on that
 * by POSTing the URL and reading only the status. If the route that serves the
 * URL answers `GET` only, every one-click becomes a `405` and the recipient is
 * pushed to "report spam" instead — the exact failure that put the promotional
 * mail in spam (#196).
 *
 * Each module was tested on its own: `email-headers.test.ts` pins the header
 * text, `unsubscribe-route-auth.test.ts` pins that the route exports a `POST`.
 * Neither crosses the boundary, so nothing forced the *pair* to agree, and
 * production shipped a header advertising a `POST` the deployed route rejected
 * with `405`. This test reads both sides plus the caller that joins them, so a
 * header without a matching route — in either direction — fails here instead of
 * in a recipient's spam folder.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const headers = read("src/server/email/email-headers.ts");
const mailer = read("src/server/email/mailer.ts");
const digestRoute = read("src/app/api/email/engagement-digest/route.ts");
const unsubscribeRoute = read("src/app/api/email/unsubscribe/route.ts");

test("the header emitter advertises one-click POST", () => {
  assert.match(
    headers,
    /"List-Unsubscribe-Post":\s*"List-Unsubscribe=One-Click"/,
    "the one-click header must be emitted verbatim; without it clients do not POST",
  );
  assert.match(
    headers,
    /"List-Unsubscribe":/,
    "the List-Unsubscribe URL the client POSTs must be present",
  );
});

test("the mailer hands the promotional family a URL to advertise", () => {
  // A header is only as good as the URL it points at, and that URL reaches
  // `buildEmailHeaders` through the mailer's `unsubscribeUrl` option.
  assert.match(
    mailer,
    /buildEmailHeaders\(\{[\s\S]*?unsubscribeUrl:/,
    "the mailer must pass the unsubscribe URL into the header builder",
  );
});

test("the advertised URL is the path the route actually serves", () => {
  // The digest is the caller that builds the URL the header points at; if it
  // ever points somewhere the route does not live, one-click breaks silently.
  assert.match(
    digestRoute,
    /new URL\(\s*"\/api\/email\/unsubscribe"/,
    "the unsubscribe URL must be built against the route's own path",
  );
});

test("the route that path names exports a POST handler, not GET only", () => {
  assert.ok(
    existsSync(new URL("../../src/app/api/email/unsubscribe/route.ts", import.meta.url)),
    "the route file the URL names must exist",
  );
  assert.match(
    unsubscribeRoute,
    /export async function POST\(/,
    "the route advertised as one-click must answer POST; a GET-only route 405s the one-click",
  );
  // Both verbs must reach the same signature-checked path, so the POST cannot be
  // a weaker second entry point.
  assert.match(
    unsubscribeRoute,
    /export async function GET\([\s\S]*?optOut\(/,
    "GET must delegate to the shared opt-out helper",
  );
  assert.match(
    unsubscribeRoute,
    /export async function POST\([\s\S]*?optOut\(/,
    "POST must delegate to the same shared opt-out helper as GET",
  );
});
