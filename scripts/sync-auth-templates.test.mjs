import assert from "node:assert/strict";
import test from "node:test";

import { AUTH_TEMPLATE_FILES, notificationFlagKey } from "./verify-auth-config.mjs";
import { buildNotificationPayload, buildTemplatePayload } from "./sync-auth-templates.mjs";

// `buildTemplatePayload` is the write half of the auth-template guard: the
// verify script reports the drift, this builds the body the sync pushes to the
// hosted project. If a name were missing from the payload the sync would leave
// that template drifting while reporting success, so every template the verifier
// compares must also appear here.

test("the payload carries a body and a subject for every repository template", () => {
  const payload = buildTemplatePayload();
  const names = Object.keys(AUTH_TEMPLATE_FILES);
  for (const name of names) {
    assert.ok(
      typeof payload[`mailer_templates_${name}_content`] === "string",
      `missing body for ${name}`,
    );
    assert.ok(payload[`mailer_templates_${name}_content`].length > 0, `empty body for ${name}`);
    assert.ok(
      typeof payload[`mailer_subjects_${name}`] === "string",
      `missing subject for ${name}`,
    );
    assert.ok(payload[`mailer_subjects_${name}`].length > 0, `empty subject for ${name}`);
  }
  assert.equal(Object.keys(payload).length, names.length * 2);
});

test("the payload keys are exactly the Management API fields the verifier reads", () => {
  // A typo in a key (`mailer_template_…`, missing `_content`) would make the
  // PATCH a no-op the verifier still reports as drift — a silent failure.
  const payload = buildTemplatePayload();
  for (const key of Object.keys(payload)) {
    assert.match(key, /^mailer_(templates_.+_content|subjects_.+)$/);
  }
});

test("the notification payload carries the switch for every pinned notification", () => {
  // The body alone does not make a notification send: the repository enables the
  // password-change notice, so the sync must push its `_enabled` switch too or a
  // project with it off keeps sending nothing while the sync reports success.
  const payload = buildNotificationPayload();
  assert.deepEqual(payload, {
    [notificationFlagKey("password_changed_notification")]: true,
  });
});
