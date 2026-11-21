import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EMAIL_PREVIEW_LOCALES,
  NATIVE_GOTRUE_TEMPLATES,
  PREVIEW_ONLY_TEMPLATES,
  PREVIEW_SIGNATURE,
  PROMOTIONAL_TEMPLATES,
  STATIC_GOTRUE_TEMPLATES,
  assertNoPreviewLink,
  buildTemplates,
  isDirectRun,
  planSend,
  previewUnsubscribeUrl,
  renderGoTrueTemplatePreview,
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

test("the preview catalog covers the complete email pack", async () => {
  const renderer = await render();
  const companyProfileRenderer = await import("../src/server/email/company-profile-render.ts");
  const templates = buildTemplates(
    renderer,
    { locale: "tr", siteUrl: SITE_URL + "/tr/" },
    companyProfileRenderer,
    Object.fromEntries(
      NATIVE_GOTRUE_TEMPLATES.map(({ name }) => [
        name,
        `<!DOCTYPE html><html><body>${name}</body></html>`,
      ]),
    ),
  );
  for (const name of [
    "auth-confirmation",
    "auth-recovery",
    "auth-reauthentication",
    "auth-password-changed",
    ...STATIC_GOTRUE_TEMPLATES,
    "welcome-candidate",
    "welcome-employer",
    "notification-candidate-applied",
    "notification-employer-applied",
    "notification-viewed",
    "notification-status",
    "feedback-ack",
    "feedback-team",
    "job-published",
    "resume-received",
    "resume-updated",
    "sales-ack",
    "sales-team",
    "company-profile-ack",
    "company-profile-team",
    "engagement",
    "marketing",
  ]) {
    assert.equal(typeof templates[name], "function", name);
  }
  assert.deepEqual(
    STATIC_GOTRUE_TEMPLATES,
    new Set([
      "auth-source-confirmation",
      "auth-source-recovery",
      "auth-source-invite",
      "auth-source-magic-link",
      "auth-source-email-change",
      "auth-source-reauthentication",
      "auth-source-password-changed",
    ]),
  );
});

test("all auth previews with sample data are blocked from sending", () => {
  for (const name of PREVIEW_ONLY_TEMPLATES) {
    const decision = planSend({
      name,
      recipient: "a@example.com",
      siteUrl: SITE_URL,
      signingKey: KEY,
    });
    assert.equal(decision.send, false, name);
    assert.match(decision.reason, /sample authentication data/);
  }
});

test("native GoTrue templates resolve correctly in all six locales", () => {
  const invitations = {
    tr: "İşBul KKTC'ye davet edildiniz",
    en: "You have been invited to İşBul KKTC",
    ru: "Вас пригласили в İşBul KKTC",
    el: "Σας προσκάλεσαν στο İşBul KKTC",
    fa: "شما به İşBul KKTC دعوت شده‌اید",
    de: "Sie wurden zu İşBul KKTC eingeladen",
  };

  const inviteSource = readFileSync(
    new URL("../supabase/templates/invite.html", import.meta.url),
    "utf8",
  );

  for (const locale of EMAIL_PREVIEW_LOCALES) {
    const html = renderGoTrueTemplatePreview(inviteSource, locale);
    const direction = locale === "fa" ? "rtl" : "ltr";
    assert.ok(html.includes('<html lang="' + locale + '" dir="' + direction + '">'), locale + ": lang/dir");
    assert.ok(html.includes(invitations[locale]), locale + ": localized invitation copy");
    assert.ok(html.includes("https://isbulkktc.com" + (locale === "tr" ? "" : "/" + locale) + "/auth/callback?code=SAMPLE"), locale + ": localized callback URL");
    assert.ok(html.includes("padding-" + (locale === "fa" ? "right" : "left") + ":14px"), locale + ": RTL-aware brand lockup");
    assert.doesNotMatch(html, /\\{\\{[\\s\\S]*?\\}\\}/, locale + ": unresolved GoTrue expression");
    assert.ok(html.includes("https://isbulkktc.com/images/isbul-logo-mark-white.png"), locale + ": hosted brand mark");
    assert.ok(html.includes("prefers-color-scheme:dark"), locale + ": dark theme");
  }

  assert.throws(
    () => renderGoTrueTemplatePreview(inviteSource, "fr"),
    /unsupported_email_preview_locale/,
  );
});

test("all native auth sources preserve the common brand palette for all locales", () => {
  for (const { name, filename } of NATIVE_GOTRUE_TEMPLATES) {
    const source = readFileSync(
      new URL("../supabase/templates/" + filename, import.meta.url),
      "utf8",
    );
    for (const locale of EMAIL_PREVIEW_LOCALES) {
      const html = renderGoTrueTemplatePreview(source, locale);
      assert.ok(html.includes('lang="' + locale + '"'), name + "/" + locale + ": lang");
      assert.ok(html.includes("isbul-logo-mark-white.png"), name + "/" + locale + ": logo");
      assert.ok(html.includes("prefers-color-scheme:dark"), name + "/" + locale + ": dark mode");
      assert.ok(html.includes("data-ogsc") && html.includes("data-ogsb"), name + "/" + locale + ": Outlook selectors");
      assert.doesNotMatch(html, /\\{\\{[\\s\\S]*?\\}\\}/, name + "/" + locale + ": unresolved GoTrue expression");
    }
  }
});

test("every native GoTrue source is rendered with inert Turkish preview values", () => {
  for (const { name, filename } of NATIVE_GOTRUE_TEMPLATES) {
    const source = readFileSync(
      new URL(`../supabase/templates/${filename}`, import.meta.url),
      "utf8",
    );
    const html = renderGoTrueTemplatePreview(source);
    assert.ok(html.includes("info@isbulkktc.com"), name);
    assert.doesNotMatch(html, /\{\{[\s\S]*?\}\}/, name);
    if (["confirmation", "recovery", "invite", "magic_link", "email_change"].includes(name)) {
      assert.ok(html.includes("code=SAMPLE"), name);
    }
    if (name === "reauthentication") assert.ok(html.includes("482913"), name);
  }
});

test("GoTrue preview processor selects Turkish copy and removes template directives", () => {
  const html = renderGoTrueTemplatePreview([
    '{{- $locale := "tr" -}}',
    '{{ if eq $locale "tr" }}Türkçe{{ else if eq $locale "en" }}English{{ end }}',
    '{{ if $rtl }}padding-right{{ else }}padding-left{{ end }}',
    '{{ .Email }}',
    '{{ .ConfirmationURL }}',
  ].join(" "));
  assert.match(html, /Türkçe/);
  assert.doesNotMatch(html, /English/);
  assert.match(html, /ornek@isbulkktc\.com/);
  assert.match(html, /code=SAMPLE/);
  assert.match(html, /padding-left/);
  assert.doesNotMatch(html, /\{\{/);
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
  const recipient = "test-recipient-06@example.invalid";
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
  const companyProfileRenderer = await import("../src/server/email/company-profile-render.ts");
  const site = { locale: "tr", siteUrl: SITE_URL + "/tr/" };
  const templates = buildTemplates(renderer, site, companyProfileRenderer, {
    invite: "<!DOCTYPE html><html><body>invite</body></html>",
    magic_link: "<!DOCTYPE html><html><body>magic link</body></html>",
    email_change: "<!DOCTYPE html><html><body>email change</body></html>",
  });

  const recipient = "test-recipient-03@example.invalid";
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
