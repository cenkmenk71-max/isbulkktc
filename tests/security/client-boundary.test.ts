import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

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

const nonPublicEnvNames = (source: string): string[] =>
  [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
    .map((match) => match[1])
    .filter((name) => !name.startsWith("NEXT_PUBLIC_"));

// ---------------------------------------------------------------------------
// 1. Client components must not reach into the server modules.
// ---------------------------------------------------------------------------

test("no client component imports a @/server module", () => {
  const offenders: string[] = [];
  for (const path of clientFiles) {
    if (/from\s+["']@\/server\//.test(read(path))) offenders.push(relative(path));
  }
  assert.deepEqual(offenders, [], `client modules importing server code: ${offenders.join(", ")}`);
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
