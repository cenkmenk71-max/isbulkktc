import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeHtml,
  renderBrandedEmail,
} from "../../supabase/functions/_shared/notification-email";

test("escapeHtml neutralises markup from job titles and copy", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
});

test("renderBrandedEmail produces a valid branded shell", () => {
  const html = renderBrandedEmail({
    preheader: "Başvurunuz işverene iletildi",
    heading: "Başvurunuz işverene iletildi",
    body: "<p>Kaydedildi.</p>",
    ctaLabel: "Panelden takip edin",
    ctaUrl: "https://isbulkktc.com/profile/dashboard#my-applications",
    footerNote: "İşBul KKTC bildirimi",
    siteUrl: "https://isbulkktc.com/",
  });

  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("İşBul KKTC"));
  assert.ok(html.includes("Kuzey Kıbrıs"));
  assert.ok(html.includes("https://isbulkktc.com/profile/dashboard#my-applications"));
  const opens = (html.match(/<table/g) ?? []).length;
  const closes = (html.match(/<\/table>/g) ?? []).length;
  assert.equal(opens, closes);
});

test("renderBrandedEmail escapes untrusted values", () => {
  const html = renderBrandedEmail({
    preheader: "x",
    heading: "<script>alert(1)</script>",
    body: "b",
    ctaLabel: "c",
    ctaUrl: "https://isbulkktc.com/",
    footerNote: "f",
    siteUrl: "https://isbulkktc.com/",
  });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
