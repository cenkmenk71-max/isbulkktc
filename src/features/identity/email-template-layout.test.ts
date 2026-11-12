import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// The 7 auth emails must survive the clients that strip stylesheets. Gmail
// removes most of a `<style>` block and Outlook's Word renderer ignores it
// outright, so the layout, the brand header and the button have to be expressible
// with inline styles on a table shell. These tests pin that contract on the raw
// template source; `tests/unit/auth-hardening.test.ts` renders them and pins the
// semantics (locales, GoTrue variables, contrast).

const templateDirectory = new URL("../../../supabase/templates/", import.meta.url);

function templates(): { name: string; source: string }[] {
  return readdirSync(templateDirectory)
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, templateDirectory), "utf8"),
    }));
}

test("every auth template ships the hosted brand logo in its header", () => {
  for (const { name, source } of templates()) {
    assert.match(
      source,
      /<img src="https:\/\/isbulkktc\.com\/images\/isbul-logo-mark-white\.png"/,
      `${name} has no logo image; the header would be text-only`,
    );
    assert.match(
      source,
      /<img[^>]*\salt="İşBul KKTC"/,
      `${name} logo has no meaningful alt text`,
    );
  }
});

test("the layout is a table shell, not a div/flex grid", () => {
  for (const { name, source } of templates()) {
    assert.match(source, /role="presentation"/, `${name} has no presentational table`);
    // The old shell used `<div class="container|header|body|footer">`; Outlook
    // flattens those to plain text. None may return.
    assert.doesNotMatch(
      source,
      /<div class="(container|header|body|footer)"/,
      `${name} still uses the div-based shell`,
    );
    assert.doesNotMatch(source, /display:\s*(flex|grid)/i, `${name} uses flex/grid`);
  }
});

test("the brand header, button and body carry inline styles", () => {
  for (const { name, source } of templates()) {
    assert.match(
      source,
      /background-color:#194435/,
      `${name} header/button green is not inline`,
    );
    // The body copy colour must be inline on the paragraph, not only in the
    // stylesheet, or it renders with the client default.
    assert.match(
      source,
      /<p style="margin:0 0 16px;font-size:15px;line-height:1\.65;color:#171B1A;"/,
      `${name} body paragraphs are not inline-styled`,
    );
  }
});

test("the stylesheet stays progressive enhancement, one shared copy", () => {
  const styles = templates().map(({ name, source }) => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1];
    assert.ok(style, `${name} has no <style> block`);
    return { name, style: style.split("\n").map((l) => l.trim()).join("\n") };
  });

  const [first, ...rest] = styles;
  for (const { name, style } of rest) {
    assert.equal(style, first.style, `${name} stylesheet drifted from ${first.name}`);
  }
});

test("the header logo-to-text gap flips for RTL", () => {
  // The brand name sits in the cell after the logo. A physical `padding-left`
  // does not flip under `dir="rtl"`, so the `fa` mail had the logo touching the
  // name with the gap on the wrong side. The gap must be direction-aware.
  for (const { name, source } of templates()) {
    assert.match(
      source,
      /vertical-align:middle;\{\{ if \$rtl \}\}padding-right\{\{ else \}\}padding-left\{\{ end \}\}:14px;/,
      `${name} header gap is not RTL-aware`,
    );
    assert.doesNotMatch(
      source,
      /padding-(left|right):14px/,
      `${name} has a physical, non-flipping header gap`,
    );
  }
});

test("the logo URL is the one the transactional layout uses", () => {
  // Two email systems, one brand mark. If the transactional layout changes the
  // asset, the auth templates must follow, or the two families look different.
  const layout = readFileSync(
    new URL("../../../supabase/functions/_shared/email-layout.ts", import.meta.url),
    "utf8",
  );
  const url = /LOGO_URL = "([^"]+)"/.exec(layout)?.[1];
  assert.ok(url, "email-layout.ts has no LOGO_URL");

  for (const { name, source } of templates()) {
    assert.ok(
      source.includes(url),
      `${name} does not use the shared LOGO_URL (${url})`,
    );
  }
});
