import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildLlmsBrief,
  buildLlmsFullBrief,
} from "@/content/ai-visibility/llms-brief";
import { buildOrganizationGraph } from "@/content/ai-visibility/structured-data";
import { getGuides } from "@/content/guides";
import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Regression guards for the GEO surface that the existing
 * `tests/unit/ai-visibility-structured-data.test.ts` does not cover: the
 * per-locale links in the full brief and the Organization `logo` asset. Both
 * shipped broken once and nothing asserted them.
 */

const BASE_URL = new URL("https://isbulkktc.com");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function localeOf(pathname: string): AppLocale {
  const first = pathname.split("/").filter(Boolean)[0];
  return routing.locales.find((locale) => locale === first) ?? routing.defaultLocale;
}

test("every guide link in the full brief resolves in its own locale", () => {
  const full = buildLlmsFullBrief(BASE_URL);
  const links = [
    ...full.matchAll(/\]\((https:\/\/isbulkktc\.com[^)]*)\)/g),
  ].map((match) => new URL(match[1]));

  const guideLinks = links.filter((url) => /\/rehber\//.test(url.pathname));
  // Three guides per locale across six locales.
  assert.equal(
    guideLinks.length,
    routing.locales.length * getGuides(routing.defaultLocale).length,
  );

  for (const url of guideLinks) {
    const locale = localeOf(url.pathname);
    const slug = url.pathname.split("/").filter(Boolean).at(-1)!;
    // Guide slugs are translated per locale, so the Turkish slug must never be
    // reused under another prefix: `getGuides` is the same lookup the page uses,
    // and a miss here is a link an answer engine would follow into a 404.
    assert.ok(
      getGuides(locale).some((guide) => guide.slug === slug),
      `${url.pathname} does not resolve to a ${locale} guide`,
    );
  }
});

test("the short brief stays the default-locale document", () => {
  const brief = buildLlmsBrief(BASE_URL);
  for (const guide of getGuides(routing.defaultLocale)) {
    assert.ok(
      brief.includes(`/rehber/${guide.slug})`),
      `the short brief omits ${guide.slug}`,
    );
  }
});

test("the organization logo is an existing asset at Google's minimum size", () => {
  const graph = buildOrganizationGraph(BASE_URL) as {
    "@graph": Array<Record<string, unknown>>;
  };
  const organization = graph["@graph"].find(
    (node) => node["@type"] === "Organization",
  )!;
  const logo = String(organization.logo);
  assert.ok(
    logo.startsWith("https://isbulkktc.com/"),
    "logo must be an absolute URL on the site origin",
  );

  // Google requires the Organization `logo` to be at least 112x112px. Reading
  // the committed file — not a constant — is what makes a 32px favicon fail.
  const relative = new URL(logo).pathname.replace(/^\//, "");
  const file = path.join(REPO_ROOT, "public", relative);
  assert.ok(existsSync(file), `logo asset ${relative} is missing`);

  const header = readFileSync(file).subarray(0, 24);
  assert.equal(header.subarray(1, 4).toString("ascii"), "PNG");
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  assert.ok(
    width >= 112 && height >= 112,
    `logo is ${width}x${height}, below Google's 112x112 minimum`,
  );
});
