import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Auth email templates are shared by the local stack (supabase/templates) and
// the hosted project (pasted into the dashboard), so they are the one artefact
// where a silent regression reaches real inboxes. These checks guard the
// contract the Go template renderer and the mail clients rely on.
const languages = ["tr", "en", "ru", "el", "fa", "de"] as const;
const templates = [
  "confirmation",
  "recovery",
  "reauthentication",
  "invite",
  "password-changed",
] as const;

const readTemplate = (name: string) =>
  readFileSync(
    new URL(`../../../supabase/templates/${name}.html`, import.meta.url),
    "utf8",
  );

// config.toml points every `content_path` at these four files; the GoTrue
// template list is confirmation, recovery, reauthentication, email_change,
// magic_link, invite. A name outside the list is parsed silently and ignored.
test("every configured template file exists and is non-trivial", () => {
  for (const name of templates) {
    const html = readTemplate(name);
    assert.ok(html.includes("<!DOCTYPE html>"), `${name} must be a full document`);
    assert.ok(html.length > 1_500, `${name} looks like a stub`);
  }
});

test("templates never leak generator placeholders", () => {
  for (const name of templates) {
    assert.ok(!readTemplate(name).includes("@@"), `${name} has a raw placeholder`);
  }
});

test("Go template blocks are balanced", () => {
  for (const name of templates) {
    const html = readTemplate(name);
    const opens = html.match(/\{\{-?\s*if\b/g) ?? [];
    const ends = html.match(/\{\{-?\s*end\b/g) ?? [];
    assert.equal(opens.length, ends.length, `${name} has unbalanced if/end`);
  }
});

test("each template branches for all six locales and defaults to Turkish", () => {
  for (const name of templates) {
    const html = readTemplate(name);
    for (const language of languages.slice(1)) {
      assert.ok(
        html.includes(`eq $lang "${language}"`),
        `${name} is missing the ${language} branch`,
      );
    }
    // Turkish is the {{ else }} fallback, so it has no explicit `eq` branch.
    assert.ok(html.includes("{{ else }}"), `${name} is missing the fallback branch`);
    assert.ok(
      html.includes('{{- $lang := "tr" -}}'),
      `${name} must default to Turkish`,
    );
  }
});

test("links are never hardcoded: only Go variables and fragments", () => {
  const linkTemplates = ["confirmation", "recovery", "invite"] as const;

  for (const name of templates) {
    const html = readTemplate(name);
    for (const href of html.match(/href="([^"]*)"/g) ?? []) {
      assert.match(
        href,
        /^href="(\{\{|#)/,
        `${name} has a non-variable href: ${href}`,
      );
    }
  }

  // Only the link-based flows carry a confirmation button; reauthentication is
  // OTP-only and password-changed is a notification, so neither has a CTA.
  for (const name of linkTemplates) {
    assert.ok(
      readTemplate(name).includes("{{ .ConfirmationURL }}"),
      `${name} must link through the confirmation variable`,
    );
  }
});

test("required GoTrue variables are preserved", () => {
  const required: Record<string, string[]> = {
    confirmation: ["{{ .Email }}", "{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
    recovery: ["{{ .Email }}", "{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
    reauthentication: ["{{ .Token }}", "{{ .SiteURL }}"],
    invite: ["{{ .Email }}", "{{ .ConfirmationURL }}", "{{ .SiteURL }}"],
    "password-changed": ["{{ .Email }}", "{{ .SiteURL }}"],
  };

  for (const [name, variables] of Object.entries(required)) {
    const html = readTemplate(name);
    for (const variable of variables) {
      assert.ok(html.includes(variable), `${name} dropped ${variable}`);
    }
  }
});

test("the document language and direction follow the selected locale", () => {
  for (const name of templates) {
    const html = readTemplate(name);
    assert.ok(
      html.includes('lang="{{ $lang }}"'),
      `${name} must localize the html lang attribute`,
    );
    assert.ok(
      html.includes('{{ if eq $lang "fa" }}rtl{{ else }}ltr{{ end }}'),
      `${name} must switch to RTL for Persian`,
    );
  }
});

test("templates stay accessible and brand-consistent", () => {
  for (const name of templates) {
    const html = readTemplate(name);
    assert.ok(html.includes("<title>"), `${name} must have a title`);
    assert.ok(
      html.includes('name="viewport"'),
      `${name} must set a viewport for mobile clients`,
    );
    assert.ok(html.includes("İşBul KKTC"), `${name} must carry the brand lockup`);
    // Table-free, image-free layout keeps the copy readable when images are
    // blocked and avoids the accessibility gaps of sliced image headers.
    assert.ok(!/<table/i.test(html), `${name} must not use layout tables`);
    assert.ok(!/<img/i.test(html), `${name} must not rely on images`);
  }
});

// config.toml is where a template is actually wired to GoTrue. A wrong section
// name (`recovry`), a missing file or a stale subject all parse silently, so the
// wiring is asserted here rather than trusted.
type Config = {
  auth: {
    email: {
      template: Record<string, { subject: string; content_path: string }>;
      notification: Record<
        string,
        { enabled?: boolean; subject: string; content_path: string }
      >;
    };
  };
};

function readConfig(): Config {
  const text = readFileSync(
    new URL("../../../supabase/config.toml", import.meta.url),
    "utf8",
  );
  // A tiny reader for the `[auth.email.*]` block: enough to prove wiring without
  // pulling a TOML dependency into the unit suite.
  const config: Config = { auth: { email: { template: {}, notification: {} } } };
  let section: "template" | "notification" | null = null;
  let current: string | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = line.match(
      /^\[auth\.email\.(template|notification)\.([A-Za-z0-9_]+)\]$/,
    );
    if (header) {
      section = header[1] as "template" | "notification";
      current = header[2];
      const bucket = config.auth.email[section];
      bucket[current] = { subject: "", content_path: "" };
      continue;
    }
    if (line.startsWith("[")) {
      section = null;
      current = null;
      continue;
    }
    if (!section || !current) continue;
    const kv = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    const target = config.auth.email[section][current] as Record<string, unknown>;
    if (key === "enabled") {
      target.enabled = value.trim() === "true";
    } else {
      // Strip the TOML basic-string quotes and undo the `\"` escapes so the
      // value matches what GoTrue actually parses.
      target[key] = value
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/\\"/g, '"');
    }
  }
  return config;
}

test("config.toml wires every template to an existing file", () => {
  const { auth } = readConfig();
  const wired = { ...auth.email.template, ...auth.email.notification };

  // GoTrue's template list is fixed; a name outside it is silently ignored.
  const gotrueNames = new Set([
    "confirmation",
    "recovery",
    "reauthentication",
    "invite",
    "magic_link",
    "email_change",
    "password_changed",
  ]);
  for (const name of Object.keys(wired)) {
    assert.ok(gotrueNames.has(name), `config.toml has an unknown template: ${name}`);
  }

  for (const name of ["confirmation", "recovery", "reauthentication", "invite"]) {
    assert.ok(auth.email.template[name], `missing [auth.email.template.${name}]`);
  }
  assert.ok(
    auth.email.notification.password_changed,
    "missing [auth.email.notification.password_changed]",
  );
  assert.equal(
    auth.email.notification.password_changed.enabled,
    true,
    "the password-changed notification must be enabled",
  );

  for (const [name, entry] of Object.entries(wired)) {
    assert.ok(entry.content_path, `${name} has no content_path`);
    // The CLI resolves this relative to the project root.
    const file = entry.content_path.replace(/^\.\//, "");
    assert.doesNotThrow(
      () =>
        readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8"),
      `${name} points at a missing file: ${entry.content_path}`,
    );
  }
});

test("every configured subject is a localized, single-line Go template", () => {
  const { auth } = readConfig();
  const wired = { ...auth.email.template, ...auth.email.notification };

  for (const [name, entry] of Object.entries(wired)) {
    const subject = entry.subject;
    assert.ok(subject.length > 0, `${name} has an empty subject`);
    assert.ok(
      !subject.includes("\n"),
      `${name} subject spans lines, which TOML basic strings cannot hold`,
    );
    assert.ok(
      subject.includes('$lang := "tr"'),
      `${name} subject must default to Turkish`,
    );
    for (const language of languages.slice(1)) {
      assert.ok(
        subject.includes(`eq $lang \`${language}\``),
        `${name} subject is missing the ${language} branch`,
      );
    }
    assert.ok(
      subject.includes("İşBul KKTC"),
      `${name} subject must carry the brand`,
    );
  }
});
