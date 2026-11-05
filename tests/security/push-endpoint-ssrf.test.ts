import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The web-push endpoint is an attacker-supplied URL the server fetches.
 *
 * `POST /api/push/subscriptions` lets a signed-in visitor store a push
 * subscription, and the only thing checked about the `endpoint` is that it is a
 * URL of 12–1024 characters starting with `https://` (`src/app/api/push/subscriptions/route.ts`;
 * the same shape is re-asserted in `register_push_subscription`,
 * `supabase/migrations/20261102100000_v4_web_push_subscriptions.sql`). The cron
 * worker then POSTs to that exact URL with `web-push`
 * (`src/app/api/push/dispatch/route.ts` -> `sendPushMessage` in
 * `src/server/push/vapid.ts`).
 *
 * Nothing constrains the *host*: no allowlist of the real push services
 * (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`,
 * `web.push.apple.com`, ...), and no block on loopback / link-local / RFC1918 /
 * cloud-metadata addresses. `web-push` sends to whatever host the URL names (its
 * only special-casing is the legacy GCM/FCM `startsWith` checks).
 *
 * ## Finding (LANE-GUVENLIK — open, filed against the owners)
 *
 * **SSRF via a registered push endpoint.** A visitor registers a subscription
 * whose `endpoint` points at an internal address — `https://127.0.0.1:PORT/...`,
 * `https://169.254.169.254/...` (cloud metadata), an internal service — and the
 * worker connects to it on the next dispatch, from inside the deployment's
 * network. Proven with the real `web-push` client against a local listener:
 *
 *     endpoint = "https://127.0.0.1:<port>/internal-only"   // passes the app's check
 *     webpush.sendNotification({ endpoint, keys }, payload, { timeout: 3000 })
 *     -> the local listener recorded 1 connection, 1568 bytes of TLS ClientHello
 *
 * The connection is made even though the push service would reject the message
 * (a bogus endpoint is not a real subscription); the *reachability probe* is the
 * harm, plus any timing/response the attacker can observe. Whether the response
 * body reaches the attacker is secondary — a blind SSRF against an internal
 * address is already a boundary crossing.
 *
 * Owner: LANE-URUN (`src/features/**`, `src/server/push/**`, the route) with
 * LANE-SUPABASE (`supabase/**`, the RPC validation). The tests below document the
 * gap as `todo` so the suite stays green while it is tracked; when the owner adds
 * a host allowlist they can be promoted to gates.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

/** Hosts that are legitimate web-push services. */
const pushServiceHosts = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

test("the push endpoint is only required to be an https URL today (documents the gap)", () => {
  // This is the *current* contract, stated so the test below can assert the
  // missing part rather than the present one.
  const route = readFileSync(
    new URL("../../src/app/api/push/subscriptions/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /endpoint:\s*z\.string\(\)\.url\(\)\.min\(12\)\.max\(1024\)\.startsWith\("https:\/\/"\)/,
    "the route's endpoint validation changed — re-read the finding above",
  );
});

test("the dispatch path sends to the stored endpoint with no host check", () => {
  // Proves the sink: the stored endpoint string is passed straight through to
  // `sendPushMessage`, which fetches it. If this ever grows a host check, the
  // finding is being addressed and the `todo` below can be promoted.
  const dispatch = readFileSync(
    new URL("../../src/app/api/push/dispatch/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(dispatch, /endpoint:\s*target\.endpoint/);
  assert.match(dispatch, /sendPushMessage\(pushTarget/);

  const vapid = readFileSync(
    new URL("../../src/server/push/vapid.ts", import.meta.url),
    "utf8",
  );
  assert.match(vapid, /webpush\.sendNotification\(subscription/);
});

test(
  "the push endpoint host is allow-listed (no SSRF to internal addresses)",
  {
    todo:
      "a registered push endpoint is fetched server-side with no host allowlist, so " +
      "https://127.0.0.1/... or https://169.254.169.254/... is contacted (SSRF); see docs/threat-model.md",
  },
  () => {
    // When the owners add a host allowlist, it should live at the registration
    // boundary (route + `register_push_subscription`) and/or the send sink. This
    // asserts *some* allowlist exists and names the real push services.
    const sources = [
      readFileSync(new URL("../../src/app/api/push/subscriptions/route.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../src/server/push/vapid.ts", import.meta.url), "utf8"),
      allSql(),
    ].join("\n");

    const namesPushService = pushServiceHosts.some((host) => sources.includes(host));
    assert.ok(
      namesPushService,
      "no push-service host allowlist is present, so an attacker-registered endpoint " +
        "can point the worker at an internal address (SSRF, see docs/threat-model.md)",
    );
  },
);
