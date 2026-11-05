import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// The identity feature is the one place that mixes a client component tree with
// server actions. A client module that reaches into `@/server/**` (all of which
// import `server-only`) or reads a non-public `process.env` value would either
// fail the build or, worse, ship a server secret's read site into the browser
// bundle. This is a static guard over the feature source so a new client file
// cannot regress the boundary unnoticed.

const featureDirectory = new URL("./", import.meta.url);

function sourceFiles(): { name: string; source: string }[] {
  return readdirSync(featureDirectory)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, featureDirectory), "utf8"),
    }));
}

function isClientModule(source: string): boolean {
  return /^\s*["']use client["']/m.test(source);
}

test("no client identity module imports a server-only path", () => {
  for (const { name, source } of sourceFiles()) {
    if (!isClientModule(source)) continue;
    assert.doesNotMatch(
      source,
      /from\s+["']@\/server\//,
      `${name} is a client module and must not import from @/server/**`,
    );
  }
});

test("no client identity module reads a non-public environment variable", () => {
  for (const { name, source } of sourceFiles()) {
    if (!isClientModule(source)) continue;
    for (const [, key] of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      assert.ok(
        key.startsWith("NEXT_PUBLIC_"),
        `${name} is a client module and reads non-public process.env.${key}`,
      );
    }
  }
});
