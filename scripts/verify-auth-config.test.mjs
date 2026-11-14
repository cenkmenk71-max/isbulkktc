import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_TEMPLATE_FILES,
  callbackIsAllowed,
  detectDeployedCaptcha,
  evaluateAuthTemplateDrift,
  evaluateCaptchaProbe,
  isDirectRun,
  notificationFlagKey,
  readRepoAuthTemplate,
  readRepoNotificationEnabled,
  readRepoTemplateSubject,
  turnstileSiteKeyInBundle,
} from "./verify-auth-config.mjs";

const ORIGIN = "https://isbulkktc.com";

test("a bare-origin allowlist entry does not cover the callback path", () => {
  // GoTrue compiles each entry with glob.MustCompile(uri, '.', '/'), so the
  // separator characters are `.` and `/`: a bare origin matches only itself and
  // `/auth/callback` spans separators. Accepting it reported a missing callback
  // entry as healthy.
  assert.equal(callbackIsAllowed(ORIGIN, ORIGIN), false);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/`), false);
});

test("the exact callback path or the globstar covers the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/auth/callback`), true);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/**`), true);
  assert.equal(
    callbackIsAllowed(ORIGIN, `http://localhost:3000/**,${ORIGIN}/auth/callback`),
    true,
  );
});

test("an unrelated or missing allowlist does not cover the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed(ORIGIN, "https://www.isbulkktc.com/auth/callback"), false);
  assert.equal(callbackIsAllowed(ORIGIN, undefined), false);
});

test("the captcha probe reads GoTrue's answer, not just the status", () => {
  // A wrong secret makes every auth request fail: GoTrue answers
  // `captcha_failed` with `invalid-input-secret`.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-secret" }).state,
    "invalid-secret",
  );
  // A valid secret rejects only our fake token — the healthy answer.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-response" }).state,
    "valid",
  );
  // No `captcha_failed` on a 4xx means captcha is not enforced.
  assert.equal(evaluateCaptchaProbe(200, {}).state, "disabled");
});

test("a rate-limited captcha probe is unreachable, not a false pass", () => {
  // Regression: the `200 <= status < 500` branch read a 429 as `disabled`, so a
  // throttled run reported "captcha is not enforced" without testing anything.
  // Supabase Auth answers 429 when a rate limit is exceeded.
  const throttled = evaluateCaptchaProbe(429, { msg: "Too many requests" });
  assert.equal(throttled.state, "unreachable");
  assert.equal(throttled.ok, false);
  // A 5xx is likewise inconclusive.
  assert.equal(evaluateCaptchaProbe(503, {}).state, "unreachable");
});

test("the direct-run guard fires even when the script path holds a space or #", () => {
  // The naive `file://${argv[1]}` guard never equals `import.meta.url` when the
  // path holds a space or `#`, so `node`-invoked runs exited 0 having verified
  // nothing. `pathToFileURL` percent-encodes both, so the guard matches.
  const url = "file:///tmp/verify%23guard%20x/verify-auth-config.mjs";
  assert.equal(isDirectRun(url, "/tmp/verify#guard x/verify-auth-config.mjs"), true);
  assert.equal(isDirectRun("file:///repo/scripts/verify-auth-config.mjs", "/repo/scripts/verify-auth-config.mjs"), true);
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, ""), false);
  assert.equal(isDirectRun("file:///repo/scripts/other.mjs", "/repo/scripts/verify-auth-config.mjs"), false);
});

test("the deployed captcha state is read from the bundle, not the local env var", () => {
  // Regression: the guard reported "captcha is disabled" whenever the *local*
  // `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was empty, but production is built by
  // Vercel with its own environment. A live widget was therefore reported as
  // off. The deployed bundle is the only evidence of what actually shipped.
  const key = "0x4AAAAAAFL-yuC1YeNRT3FB";
  const loader = 'loadTurnstileScript(){s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"}';
  assert.equal(turnstileSiteKeyInBundle(`${loader}key="${key}"`), key);
  // The SDK URL without a key still proves a key is configured (minified form).
  assert.equal(turnstileSiteKeyInBundle(loader), "(present)");
  // A bundle that never mentions Turnstile is a genuine "no captcha".
  assert.equal(turnstileSiteKeyInBundle("const x=1;"), null);
  assert.equal(turnstileSiteKeyInBundle(null), null);
});

test("detectDeployedCaptcha follows the login page into its chunks", async () => {
  const key = "0x4AAAAAAFL-yuC1YeNRT3FB";
  const html = '<script src="/_next/static/chunks/app.js"></script>';
  const fetchImpl = async (url) => ({
    status: 200,
    text: async () =>
      url.endsWith("/login")
        ? html
        : `s.src="https://challenges.cloudflare.com/turnstile/v0/api.js";k="${key}"`,
  });
  const found = await detectDeployedCaptcha("https://isbulkktc.com", fetchImpl);
  assert.equal(found.checked, true);
  assert.equal(found.siteKey, key);

  // A login page that will not load is "could not tell", never "captcha is off".
  const unreachable = await detectDeployedCaptcha("https://isbulkktc.com", async () => ({
    status: 503,
    text: async () => "",
  }));
  assert.equal(unreachable.checked, false);
});

// The Auth dashboard stores each template body and subject in the project
// config, not in git, and nothing re-syncs them. A template pasted by hand
// therefore drifts from `supabase/templates/` with no test able to see it — the
// recovery email shipped as a 1.4 kB unbranded one-off exactly this way. These
// tests pin the comparator that turns that silent drift into a failing check.

/** A repository map covering every template, so no real file is read. */
function fullRepo(tag = "repo") {
  const repo = {};
  for (const name of Object.keys(AUTH_TEMPLATE_FILES)) {
    repo[name] = `<html>${name}-${tag}</html>\n`;
  }
  return repo;
}

/**
 * The hosted config that matches `repo`. The Management API always returns a
 * subject for every template, so the default shape carries the pinned ones; a
 * test that wants the subject absent or replaced overrides the single field.
 */
function fullLive(repo, { subjects = true } = {}) {
  const config = {};
  for (const [name, content] of Object.entries(repo)) {
    config[`mailer_templates_${name}_content`] = content;
    if (subjects) config[`mailer_subjects_${name}`] = readRepoTemplateSubject(name);
    const enabled = readRepoNotificationEnabled(name);
    if (typeof enabled === "boolean") config[notificationFlagKey(name)] = enabled;
  }
  return config;
}

test("the repository templates and subjects are read from disk", () => {
  // The guard's whole value is that it compares the live config against the
  // repository, so these readers must actually find the files. A silent `null`
  // here would make every drift check pass without comparing anything.
  assert.match(readRepoAuthTemplate("confirmation"), /<!DOCTYPE html>/);
  assert.equal(typeof readRepoTemplateSubject("recovery"), "string");
  assert.ok(readRepoTemplateSubject("recovery").length > 0);
  // An unknown template is skipped, not reported as drift.
  assert.equal(readRepoAuthTemplate("no_such_template"), null);
  assert.equal(readRepoTemplateSubject("no_such_template"), null);
});

test("matching templates and subjects are not reported as drift", () => {
  const repo = fullRepo();
  const live = fullLive(repo, { subjects: true });
  assert.deepEqual(evaluateAuthTemplateDrift(live, repo), []);
});

test("a trailing newline difference is not drift", () => {
  const repo = fullRepo();
  const live = fullLive(repo);
  live.mailer_templates_confirmation_content = `${repo.confirmation}\n\n`;
  assert.deepEqual(evaluateAuthTemplateDrift(live, repo), []);
});

test("a hand-pasted template body is reported as drift", () => {
  // The exact production failure: the live recovery body is a 1.4 kB one-off
  // while the repository holds the 10.7 kB branded template.
  const repo = fullRepo();
  const live = fullLive(repo);
  live.mailer_templates_recovery_content = "<html>old</html>";
  const problems = evaluateAuthTemplateDrift(live, repo);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /live recovery template differs/);
});

test("an empty live template is reported, not skipped", () => {
  const repo = fullRepo();
  const live = fullLive(repo);
  delete live.mailer_templates_invite_content;
  const problems = evaluateAuthTemplateDrift(live, repo);
  assert.deepEqual(problems, ["the invite template is empty on the hosted project"]);
});

test("a dashboard-replaced subject is reported as drift", () => {
  // A dashboard edit resets the localized subject to GoTrue's English default,
  // so the body can match while the subject silently loses its localization.
  const repo = fullRepo();
  const live = fullLive(repo, { subjects: true });
  live.mailer_subjects_magic_link = "Your sign-in link";
  const problems = evaluateAuthTemplateDrift(live, repo);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /live magic_link subject is not the localized one/);
  assert.match(problems[0], /Your sign-in link/);
});

test("the password-change notice is compared, not skipped", () => {
  // Production served an older revision of the password-change notice with
  // GoTrue's English default subject while every other template matched, because
  // GoTrue's `password_changed_notification` field was missing from the map. The
  // subject also lives under a differently named config.toml block
  // (`[auth.email.notification.password_changed]`), so the lookup must map it.
  assert.equal(AUTH_TEMPLATE_FILES.password_changed_notification, "password-changed.html");
  assert.equal(typeof readRepoTemplateSubject("password_changed_notification"), "string");
  assert.ok(readRepoTemplateSubject("password_changed_notification").length > 0);

  const repo = fullRepo();
  const live = fullLive(repo);
  live.mailer_templates_password_changed_notification_content = "<html>older</html>";
  live.mailer_subjects_password_changed_notification = "Your password was changed";
  const problems = evaluateAuthTemplateDrift(live, repo);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /live password_changed_notification template differs/);
  assert.match(problems[1], /live password_changed_notification subject is not the localized one/);
});

test("the notification flag key maps a template name to GoTrue's switch", () => {
  // GoTrue drops `_notification` and appends `_enabled`; a plain
  // `mailer_notifications_password_changed_notification_enabled` would be a key
  // the Management API ignores, so the drift check would silently pass.
  assert.equal(
    notificationFlagKey("password_changed_notification"),
    "mailer_notifications_password_changed_enabled",
  );
});

test("a notification the repository enables but production disables is drift", () => {
  // The live password-change notice was switched off while config.toml sets
  // `enabled = true`, so no notice was sent at all — a failure invisible to every
  // body/subject comparison because the template itself was still present.
  const repo = fullRepo();
  const live = fullLive(repo);
  live.mailer_notifications_password_changed_enabled = false;
  const problems = evaluateAuthTemplateDrift(live, repo);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /password_changed_notification notification is disabled/);
  assert.match(problems[0], /enabled = true/);
});

test("a matching notification switch is not drift", () => {
  const repo = fullRepo();
  const live = fullLive(repo);
  live.mailer_notifications_password_changed_enabled = true;
  assert.deepEqual(evaluateAuthTemplateDrift(live, repo), []);
});

test("readRepoNotificationEnabled reads the block and skips templates without one", () => {
  assert.equal(readRepoNotificationEnabled("password_changed_notification"), true);
  // The six regular templates declare no notification block, so they are skipped
  // rather than reported as drift.
  assert.equal(readRepoNotificationEnabled("confirmation"), null);
});
