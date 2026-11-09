import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * Cookie inventory and flag audit (issue #418 §6 — the owner's top priority:
 * "hesapla yapılacak bütün işlemlerin ve çerezle ilgili her şeyin mükemmel
 * olması").
 *
 * The session cookie is already pinned by `session-cookie-flags.test.ts` and the
 * locale cookie by `locale-cookie-flags.test.ts`. This file closes the remaining
 * §6 gap: the **consent cookie** (`ib_consent`) had no security assertion at all
 * — its flags lived only in a source comment and a unit test that checks the
 * name, never the attributes. It also ratchets the whole client-cookie surface,
 * so a new `document.cookie` writer cannot ship unaudited.
 *
 * The app writes these cookies (the inventory this file keeps honest):
 *
 * | Cookie | Writer | Purpose | Flags |
 * |---|---|---|---|
 * | `sb-<ref>-auth-token` (+ `-code-verifier`) | `@supabase/ssr` via `src/proxy.ts`, `src/server/db/supabase-server.ts` | session / PKCE | HttpOnly, Secure (prod), SameSite=Lax — pinned in `session-cookie-flags.test.ts` |
 * | `ib_oauth_signup_intent` | `src/features/identity/actions.ts` | OAuth sign-up audience | HttpOnly, Secure (prod), SameSite=Lax — pinned in `session-cookie-flags.test.ts` |
 * | `NEXT_LOCALE` | `next-intl` middleware (`src/i18n/routing.ts`) | language choice | Secure (prod), SameSite=Lax — pinned in `locale-cookie-flags.test.ts` |
 * | `ib_consent` | `src/components/analytics/consent-browser.ts` (client) | analytics/marketing consent | Secure (https), SameSite=Lax, Path=/, **not** HttpOnly — pinned here |
 *
 * `ib_consent` is deliberately not `HttpOnly`: the banner must be able to clear
 * it when the visitor withdraws consent, and `document.cookie` cannot set an
 * `HttpOnly` attribute. It carries only the two booleans the visitor chose, so
 * it holds no secret — the same reasoning `docs/data-retention.md` records.
 */

const srcDir = new URL("../../src/", import.meta.url);

function walk(directory: URL): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...walk(new URL(`${entry}/`, directory)));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path.pathname);
  }
  return files;
}

const sourceFiles = walk(srcDir);

function relative(path: string): string {
  return path.slice(path.indexOf("/src/") + 1);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * The `document.cookie` access, in both spellings the language allows: dot
 * (`document.cookie`) and bracket (`document["cookie"]`). The property name is
 * a plain string, so `obj["cookie"]` is the same property as `obj.cookie` —
 * a detector that reads only the dot form lets a bracket-notation write ship
 * with the file still green. This is the same false-negative class the sibling
 * detectors were hardened against (`log-safety`'s `console["error"]`,
 * `client-boundary`'s `process.env["NAME"]`). `\b` keeps `document.cookiefoo`
 * out. A bare alias (`const d = document; d.cookie = …`) is a conscious limit:
 * `document` is a global with no local rebinding in this tree, and tracking
 * every alias would flag unrelated `.cookie` properties on other objects.
 */
const DOCUMENT_COOKIE = String.raw`document\s*(?:\.\s*cookie\b|\[\s*["'\x60]cookie["'\x60]\s*\])`;

/** Files that assign `document.cookie` — i.e. every client-side cookie writer. */
function documentCookieWriters(): string[] {
  const writer = new RegExp(`${DOCUMENT_COOKIE}\\s*=`);
  return sourceFiles
    .filter((path) => writer.test(read(path)))
    .map(relative)
    .sort();
}

/**
 * Every `document.cookie = <literal>` assignment in one file, with the quote
 * character and the literal body. All three literal forms are captured — a
 * double-quoted `"a=1"` is a real write site, and the flag audit must see it (a
 * detector that only reads template literals would let a future cookie written
 * with quotes ship unaudited). Both the dot and bracket access forms are read
 * (see `DOCUMENT_COOKIE`).
 */
function documentCookieAssignments(source: string): { quote: string; body: string }[] {
  const assignments: { quote: string; body: string }[] = [];
  const re = new RegExp(`${DOCUMENT_COOKIE}\\s*=\\s*(["'\x60])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    assignments.push({ quote: match[1], body: match[2] });
  }
  return assignments;
}

/** The literal bodies assigned to `document.cookie` in one file. */
function documentCookieTemplates(source: string): string[] {
  return documentCookieAssignments(source).map(({ body }) => body);
}

/** Every `export const …CookieName = "…"` — the app-defined cookie names. */
function declaredCookieNames(): string[] {
  const names: string[] = [];
  for (const path of sourceFiles) {
    const re = /export const \w*[Cc]ookieName\s*=\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(read(path))) !== null) names.push(match[1]);
  }
  return names.sort();
}

/**
 * The cookie names this app can write, each with the file that owns its audit.
 * `sb-*` is written by `@supabase/ssr` (no literal in `src/**`); `NEXT_LOCALE` by
 * the `next-intl` middleware. A new name here means a new cookie shipped without
 * a documented purpose/flags row — the ratchet makes that a review, not a miss.
 */
const auditedCookieNames = ["ib_consent", "ib_oauth_signup_intent"];

// ---------------------------------------------------------------------------
// 1. Inventory ratchet: every app-defined cookie name is audited, and every
//    client-side writer is on the list this file documents.
// ---------------------------------------------------------------------------

test("every app-defined cookie name is on the audited inventory", () => {
  assert.deepEqual(
    declaredCookieNames(),
    auditedCookieNames,
    "a cookie name was added or removed without updating the §6 inventory in this file",
  );
});

test("every client cookie writer is on the audited list (ratchet)", () => {
  assert.deepEqual(
    documentCookieWriters(),
    ["src/components/analytics/consent-browser.ts"],
    "a new `document.cookie` writer shipped; add its flags to the §6 inventory",
  );
});

// ---------------------------------------------------------------------------
// 2. The rule for client cookies: any `document.cookie` write must scope itself
//    to `Path=/`, keep a SameSite of Lax/Strict, and set Secure on HTTPS.
//    Without this, a future client cookie silently loses the hardening the
//    consent cookie has today.
// ---------------------------------------------------------------------------

test("every document.cookie write is scoped and hardened", () => {
  const offenders: string[] = [];
  for (const file of documentCookieWriters()) {
    const source = read(new URL(`../../${file}`, import.meta.url).pathname);
    // `Secure` is conditional on HTTPS, so it arrives as an interpolation.
    const wiresSecure = /window\.location\.protocol\s*===\s*["']https:["']/.test(source);
    for (const template of documentCookieTemplates(source)) {
      const hasPath = /(?:^|;\s*)Path=\//i.test(template);
      const hasSameSite = /(?:^|;\s*)SameSite=(?:Lax|Strict)/i.test(template);
      const hasSecure = /\bSecure\b/.test(template) || /\$\{\s*secure\s*\}/.test(template);
      if (!hasPath || !hasSameSite || !hasSecure || !wiresSecure) {
        offenders.push(
          `${file} [path:${hasPath} sameSite:${hasSameSite} secure:${hasSecure} wiresSecure:${wiresSecure}]: ${template}`,
        );
      }
    }
  }
  assert.deepEqual(offenders, [], `unhardened client cookies:\n${offenders.join("\n")}`);
});

// ---------------------------------------------------------------------------
// 3. The consent cookie specifically — the §6 gap this file closes. Both the
//    write and the withdrawal-clear must carry the same Path/SameSite/Secure
//    attributes, or the browser keeps the original on withdrawal.
// ---------------------------------------------------------------------------

test("the ib_consent cookie is Secure (https), SameSite=Lax and Path=/", () => {
  const source = read(
    new URL("../../src/components/analytics/consent-browser.ts", import.meta.url).pathname,
  );
  const templates = documentCookieTemplates(source);
  assert.equal(
    templates.length,
    2,
    "expected the write and the withdrawal-clear to both set the cookie",
  );
  for (const template of templates) {
    assert.match(template, /(?:^|;\s*)Path=\//i, `consent cookie lost Path=/:\n${template}`);
    assert.match(
      template,
      /(?:^|;\s*)SameSite=Lax/i,
      `consent cookie lost SameSite=Lax:\n${template}`,
    );
    assert.match(template, /\$\{\s*secure\s*\}/, `consent cookie lost Secure:\n${template}`);
  }
  // The interpolation is only worth anything if it resolves to `; Secure` on HTTPS.
  assert.match(
    source,
    /window\.location\.protocol\s*===\s*["']https:["']\s*\?\s*["']; Secure["']\s*:\s*["']["']/,
    "the consent cookie's `secure` value is no longer the HTTPS conditional",
  );
  // It is deliberately not HttpOnly — document that so it cannot regress silently.
  assert.doesNotMatch(
    templates.join("\n"),
    /HttpOnly/i,
    "the consent cookie must stay readable by the banner that clears it (no HttpOnly)",
  );
});

test("the consent cookie carries a finite Max-Age on the write", () => {
  const source = read(
    new URL("../../src/components/analytics/consent-browser.ts", import.meta.url).pathname,
  );
  const templates = documentCookieTemplates(source);
  const write = templates.find((template) => /Max-Age=\$\{consentCookieMaxAgeSeconds\}/.test(template));
  assert.ok(write, "the consent write no longer bounds its lifetime with Max-Age");
  const clear = templates.find((template) => /Max-Age=0/.test(template));
  assert.ok(clear, "the withdrawal-clear no longer expires the cookie with Max-Age=0");
});

// ---------------------------------------------------------------------------
// 4. Self-tests: the detectors are only as wide as their matchers, so prove they
//    see the forms they claim to and reject a near-miss.
// ---------------------------------------------------------------------------

test("the document.cookie detector sees a write but not a read (self-test)", () => {
  assert.deepEqual(documentCookieTemplates("document.cookie = `a=1; Path=/`;"), ["a=1; Path=/"]);
  // Reading the cookie jar is not a write.
  assert.deepEqual(documentCookieTemplates("const all = document.cookie;"), []);
  // Every literal form is a write site the flag audit must read — not just the
  // template form the current code happens to use.
  assert.deepEqual(documentCookieTemplates('document.cookie = "a=1";'), ["a=1"]);
  assert.deepEqual(documentCookieTemplates("document.cookie = 'a=1';"), ["a=1"]);
});

test("the document.cookie detector reads the bracket access form (self-test)", () => {
  // `document["cookie"]` is the same property as `document.cookie`; a detector
  // that reads only the dot form lets a bracket-notation write ship green.
  assert.deepEqual(documentCookieTemplates('document["cookie"] = `a=1; Path=/`;'), ["a=1; Path=/"]);
  assert.deepEqual(documentCookieTemplates("document['cookie'] = `b=2; Path=/`;"), ["b=2; Path=/"]);
  assert.deepEqual(documentCookieTemplates('document["cookie"] = "c=3; Path=/";'), ["c=3; Path=/"]);
  // Reading through the bracket form is still not a write.
  assert.deepEqual(documentCookieTemplates('const x = document["cookie"];'), []);
  // A different property name must not match (the `\b` keeps `cookiefoo` out).
  assert.deepEqual(documentCookieTemplates('document["cookiefoo"] = `x=1`;'), []);
});

test("the cookie-name detector sees a declared name and rejects a near-miss (self-test)", () => {
  const names: string[] = [];
  const re = /export const \w*[Cc]ookieName\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  const source = [
    'export const consentCookieName = "ib_consent";',
    'export const oauthSignupIntentCookieName = "ib_oauth_signup_intent";',
    // A non-exported constant or a differently named export must not match.
    'const hiddenCookieName = "nope";',
    'export const somethingElse = "also-nope";',
  ].join("\n");
  while ((match = re.exec(source)) !== null) names.push(match[1]);
  assert.deepEqual(names, ["ib_consent", "ib_oauth_signup_intent"]);
});

// ---------------------------------------------------------------------------
// 5. The §6 table is the audit's single source of truth, so a row must not
//    drift from the code it summarises. `NEXT_LOCALE`'s row kept reading
//    "no Secure — open finding" long after LANE-İÇERİK closed it (#469/#498),
//    which would have misled the next cookie audit into re-opening a fixed
//    finding. Pin the row to the routing config it describes.
// ---------------------------------------------------------------------------

test("the NEXT_LOCALE inventory row matches the routing config it describes", () => {
  const inventory = read(new URL(import.meta.url).pathname);
  const routing = read(new URL("../../src/i18n/routing.ts", import.meta.url).pathname);

  const row = inventory.split("\n").find((line) => /\|\s*`NEXT_LOCALE`\s*\|/.test(line));
  assert.ok(row, "the §6 table no longer documents the NEXT_LOCALE cookie");

  // `src/i18n/routing.ts` (LANE-İÇERİK) hardens the locale cookie in production.
  assert.match(
    routing,
    /localeCookie:\s*\{[^}]*secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/,
    "routing.ts no longer sets Secure on the locale cookie in production",
  );
  // So the row must claim Secure and must not still advertise the closed finding.
  assert.match(row, /Secure \(prod\)/, `the NEXT_LOCALE row is stale: ${row}`);
  assert.doesNotMatch(
    row,
    /no Secure|open finding/,
    `the NEXT_LOCALE row still advertises the closed #469/#498 finding: ${row}`,
  );
});
