import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { nonPublicEnvNames } from "./env-access";

/**
 * The server/client boundary, checked statically.
 *
 * The highest-value secret in this app is `SUPABASE_SERVICE_ROLE_KEY`: it
 * bypasses RLS entirely. Next.js only inlines `NEXT_PUBLIC_*` variables into the
 * browser bundle, so a server module that is accidentally imported from a client
 * component does not ship the key — but it does defeat the repository's own
 * defence (the `server-only` marker, which turns that mistake into a build
 * error). These tests keep the boundary honest:
 *
 *  1. no `"use client"` module imports a `@/server/**` module;
 *  2. no `"use client"` module reads a non-public `process.env.*` at module scope;
 *  3. no `NEXT_PUBLIC_`-prefixed name looks like a secret;
 *  4. every `src/server/**` module that reads a non-public env var is guarded by
 *     `import "server-only"` (this one documents an open gap — see below).
 */

const srcDir = new URL("../../src/", import.meta.url);

function walk(directory: URL): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
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

const clientFiles = sourceFiles.filter((path) => /^\s*["']use client["']/m.test(read(path)));

// ---------------------------------------------------------------------------
// 1. Client components must not reach into the server modules.
// ---------------------------------------------------------------------------

/**
 * True when a module references a `@/server/**` module by any import form:
 * a static `from "@/server/..."`, a dynamic `import("@/server/...")`, or a
 * `require("@/server/...")`. The earlier check only matched `from "@/server/`,
 * so a client component could reach server code through a dynamic import and
 * this boundary would stay green — the `server-only` marker is the compile-time
 * backstop, but a boundary test that only sees one spelling is half a test.
 */
function importsServerModule(source: string): boolean {
  return (
    /from\s+["']@\/server\//.test(source) ||
    /\bimport\s*\(\s*["']@\/server\//.test(source) ||
    /\brequire\s*\(\s*["']@\/server\//.test(source)
  );
}

test("no client component imports a @/server module", () => {
  const offenders: string[] = [];
  for (const path of clientFiles) {
    if (importsServerModule(read(path))) offenders.push(relative(path));
  }
  assert.deepEqual(offenders, [], `client modules importing server code: ${offenders.join(", ")}`);
});

test("the server-import check sees every import form (self-test)", () => {
  // Guards the guard: each of these is a real way to reach server code.
  assert.equal(importsServerModule('import { x } from "@/server/db/supabase-server";'), true);
  assert.equal(importsServerModule('export { x } from "@/server/db/supabase-server";'), true);
  assert.equal(importsServerModule('const m = await import("@/server/email/mailer");'), true);
  assert.equal(importsServerModule('const m = require("@/server/email/mailer");'), true);
  // And a client-local module must not be flagged.
  assert.equal(importsServerModule('import { x } from "@/features/sales/schemas";'), false);
});

// ---------------------------------------------------------------------------
// 2. Client components must not read server secrets.
// ---------------------------------------------------------------------------

test("no client component reads a non-public environment variable", () => {
  const offenders: string[] = [];
  for (const path of clientFiles) {
    const names = nonPublicEnvNames(read(path));
    if (names.length > 0) offenders.push(`${relative(path)} [${[...new Set(names)].join(", ")}]`);
  }
  assert.deepEqual(offenders, [], `client modules reading server env: ${offenders.join(", ")}`);
});

test("the env reader sees every access form, not just dot access (self-test)", () => {
  // Guards the guard: the boundary above is only as strong as this extractor. A
  // secret read through brackets or destructuring must be flagged, or the test
  // would pass while a client module shipped `SUPABASE_SERVICE_ROLE_KEY`.
  const detected = (snippet: string) => nonPublicEnvNames(snippet);

  assert.deepEqual(detected("process.env.SUPABASE_SERVICE_ROLE_KEY"), [
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.deepEqual(detected('process.env["SUPABASE_SERVICE_ROLE_KEY"]'), [
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.deepEqual(detected("process.env['RESEND_API_KEY']"), ["RESEND_API_KEY"]);
  assert.deepEqual(detected("process.env?.VAPID_PRIVATE_KEY"), ["VAPID_PRIVATE_KEY"]);
  assert.deepEqual(detected("process['env'].PUSH_CRON_SECRET"), ["PUSH_CRON_SECRET"]);
  assert.deepEqual(detected('process["env"]["RESEND_API_KEY"]'), ["RESEND_API_KEY"]);
  assert.deepEqual(detected("const { SUPABASE_SERVICE_ROLE_KEY } = process.env;"), [
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.deepEqual(
    detected("const { RESEND_API_KEY: key, VAPID_PRIVATE_KEY } = process.env;"),
    ["RESEND_API_KEY", "VAPID_PRIVATE_KEY"],
  );

  // And the public prefix is still excluded in every form.
  assert.deepEqual(detected('process.env["NEXT_PUBLIC_SUPABASE_URL"]'), []);
  assert.deepEqual(detected("process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID"), []);
});

// ---------------------------------------------------------------------------
// 3. A public variable name must never look like a secret.
// ---------------------------------------------------------------------------

const secretNamePattern = /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|_TOKEN|API_KEY|CRON/i;

test("no NEXT_PUBLIC_ variable is named like a secret", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles) {
    for (const match of read(path).matchAll(/NEXT_PUBLIC_([A-Z0-9_]+)/g)) {
      if (secretNamePattern.test(match[1])) offenders.push(`${relative(path)}: NEXT_PUBLIC_${match[1]}`);
    }
  }

  const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  for (const match of envExample.matchAll(/NEXT_PUBLIC_([A-Z0-9_]+)/g)) {
    if (secretNamePattern.test(match[1])) offenders.push(`.env.example: NEXT_PUBLIC_${match[1]}`);
  }

  assert.deepEqual(offenders, [], `public env names that look secret: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// 4. Server modules that read secrets declare the server-only boundary.
//
// Every secret-reading module under `src/server/**` imports `server-only` except
// `unsubscribe-token-core.ts` (it reads `ENGAGEMENT_UNSUBSCRIBE_SECRET` /
// `RESEND_API_KEY`). The marker is what turns an accidental client import into a
// build failure; without it the mistake compiles. Marked `todo` because the fix
// belongs to the owner of `src/server/email/**`; once the import is added this
// starts passing and the `todo` can be dropped. See `docs/threat-model.md`.
// ---------------------------------------------------------------------------

test(
  "every server module reading a secret imports server-only",
  { todo: "src/server/email/unsubscribe-token-core.ts is unguarded (see docs/threat-model.md)" },
  () => {
    const offenders: string[] = [];
    for (const path of sourceFiles) {
      if (!path.includes("/src/server/")) continue;
      const source = read(path);
      if (nonPublicEnvNames(source).length === 0) continue;
      if (!/import\s+["']server-only["']/.test(source)) offenders.push(relative(path));
    }
    assert.deepEqual(
      offenders,
      [],
      `secret-reading server modules without the server-only marker: ${offenders.join(", ")}`,
    );
  },
);
