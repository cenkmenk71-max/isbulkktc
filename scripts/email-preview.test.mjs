import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_SIGNATURE,
  PROMOTIONAL_TEMPLATES,
  assertNoPreviewLink,
  buildTemplates,
  isDirectRun,
  planSend,
  previewUnsubscribeUrl,
  renderTemplate,
} from "./email-preview.mjs";
import { verifyUnsubscribeSignatureWithKey } from "../src/server/email/unsubscribe-signature.ts";

const KEY = "test-signing-key-0123456789";
const SITE_URL = "https://isbulkktc.com";

async function render() {
  return import("../supabase/functions/_shared/email-render.ts");
}

test("isDirectRun matches the launched path and ignores a bare import", () => {
  const self = new URL("./email-preview.mjs", import.meta.url).pathname;
  assert.equal(isDirectRun(`file://${self}`, self), true);
  assert.equal(isDirectRun("file:///other.mjs", self), false);
  assert.equal(isDirectRun("file:///x.mjs", undefined), false);
});

test("promotional families need a signing key; transactional ones never do", () => {
  assert.deepEqual(PROMOTIONAL_TEMPLATES, new Set(["marketing", "engagement"]));

  for (const name of PROMOTIONAL_TEMPLATES) {
    const blocked = planSend({
      name,
      recipient: "a@example.com",
      siteUrl: SITE_URL,
      signingKey: null,
    });
    // Fail closed: no key means no link, and no link means no send.
    assert.equal(blocked.send, false, `${name} must be refused without a key`);
    assert.match(blocked.reason, /signing key/);
  }

  const welcome = planSend({
    name: "welcome",
    recipient: "a@example.com",
    siteUrl: SITE_URL,
    signingKey: null,
  });
  assert.deepEqual(welcome, { send: true, unsubscribeUrl: null });
});

test("a promotional send carries the recipient's real signed opt-out link", () => {
  const recipient = "muhammedali.kahraman@outlook.com";
  const plan = planSend({
    name: "marketing",
    recipient,
    siteUrl: SITE_URL,
    signingKey: KEY,
  });

  assert.equal(plan.send, true);
  const url = new URL(plan.unsubscribeUrl);
  assert.equal(url.origin + url.pathname, `${SITE_URL}/api/email/unsubscribe`);
  assert.equal(url.searchParams.get("e"), recipient);
  assert.equal(
    verifyUnsubscribeSignatureWithKey(recipient, url.searchParams.get("s"), KEY),
    true,
    "the emitted signature must verify under the same key",
  );
});

test("the signing key is normalised the same way the verifier expects", () => {
  // An address that differs only in case/whitespace must produce a link the
  // route verifies: both sides lower-case and trim before signing.
  const plan = planSend({
    name: "engagement",
    recipient: "  MiXeD@Example.COM ",
    siteUrl: SITE_URL,
    signingKey: KEY,
  });
  const url = new URL(plan.unsubscribeUrl);
  const email = url.searchParams.get("e");
  assert.equal(email, "mixed@example.com");
  assert.equal(
    verifyUnsubscribeSignatureWithKey(email, url.searchParams.get("s"), KEY),
    true,
  );
});

test("an unusable site URL refuses the send instead of emitting a broken link", () => {
  const plan = planSend({
    name: "marketing",
    recipient: "a@example.com",
    siteUrl: "not a url",
    signingKey: KEY,
  });
  assert.equal(plan.send, false);
  assert.match(plan.reason, /site URL/);
});

test("the browser preview embeds a placeholder, not a real link", () => {
  const placeholder = previewUnsubscribeUrl("marketing");
  assert.ok(placeholder.includes(PREVIEW_SIGNATURE));
  assert.equal(previewUnsubscribeUrl("welcome"), null);

  // The placeholder is deliberately not a valid HMAC.
  const url = new URL(placeholder);
  assert.equal(
    verifyUnsubscribeSignatureWithKey(
      url.searchParams.get("e"),
      url.searchParams.get("s"),
      KEY,
    ),
    false,
  );
});

test("assertNoPreviewLink refuses a body that still carries the placeholder", () => {
  assert.throws(
    () =>
      assertNoPreviewLink("marketing", {
        html: `<a href="x?s=${PREVIEW_SIGNATURE}">out</a>`,
        text: "out",
      }),
    /PREVIEW-ONLY/,
  );
  // The placeholder can hide in the text part alone.
  assert.throws(
    () =>
      assertNoPreviewLink("engagement", {
        html: "<p>clean</p>",
        text: `unsubscribe: ${PREVIEW_SIGNATURE}`,
      }),
    /PREVIEW-ONLY/,
  );
  assert.doesNotThrow(() =>
    assertNoPreviewLink("marketing", { html: "<p>clean</p>", text: "clean" }),
  );
});

test("the body the send path renders carries the real link, never the placeholder", async () => {
  const renderer = await render();
  const site = { locale: "tr", siteUrl: SITE_URL };
  const templates = buildTemplates(renderer, site);

  const recipient = "letgodeneme97@outlook.com";
  const plan = planSend({
    name: "marketing",
    recipient,
    siteUrl: SITE_URL,
    signingKey: KEY,
  });

  // This is exactly what `sendAll` renders for a promotional family.
  const body = renderTemplate(templates, "marketing", plan.unsubscribeUrl);

  assert.doesNotThrow(() => assertNoPreviewLink("marketing", body));
  assert.equal(body.html.includes(PREVIEW_SIGNATURE), false);
  assert.equal(body.text.includes(PREVIEW_SIGNATURE), false);
  // HTML-escaped in the anchor, raw in the text part.
  assert.equal(body.html.includes(plan.unsubscribeUrl.replace(/&/g, "&amp;")), true);
  assert.equal(body.text.includes(plan.unsubscribeUrl), true);

  // A placeholder render, by contrast, is exactly what the guard rejects.
  const previewBody = renderTemplate(templates, "marketing", previewUnsubscribeUrl("marketing"));
  assert.throws(() => assertNoPreviewLink("marketing", previewBody), /PREVIEW-ONLY/);
});
