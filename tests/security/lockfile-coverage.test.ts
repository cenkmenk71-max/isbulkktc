import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Supply-chain boundary: a committed lockfile must resolve the manifest it
 * accompanies.
 *
 * The repository carries **two** lockfiles. `bun.lock` is the one CI installs
 * from (`bun install --frozen-lockfile` in every job), but Dependabot's npm
 * ecosystem audits `package-lock.json` instead — it is the only manifest the
 * advisory scan reads (#188). That makes the stale lock a blind spot rather
 * than a harmless duplicate: an advisory in a package the stale lock never
 * resolved is invisible to the scan while the code still ships.
 *
 * `package-lock.json` (lockfileVersion 3) does not resolve four direct
 * dependencies `package.json` declares — `qrcode` and `web-push` (production)
 * and `jsqr` and `pngjs` (dev). npm treats a lock that omits a declared
 * dependency as out of sync and refuses `npm ci`. `lucide-react` is stale in the
 * same lock: it pins `1.63.0` where `bun.lock` resolves `1.62.0`.
 *
 * The invariant below is deliberately narrow — direct dependencies only. That is
 * exactly what a lockfile is required to resolve, and it is stable across
 * lockfile versions (npm's `packages` keys are `node_modules/<name>`, bun's are
 * bare names). Transitive completeness is left alone; it drifts for reasons
 * unrelated to this boundary.
 *
 * The `bun.lock` side is a gate: it passes today and turns red the moment the
 * canonical lock stops tracking the manifest. The `package-lock.json` side is a
 * `todo` — it documents the open finding (#188) without failing the run, and
 * passes on its own once LANE-INFRA regenerates or drops the stale lock.
 */

const root = new URL("../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

/** `bun.lock` is JSONC; strip line comments and trailing commas before parsing. */
function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  }
}

const manifest = JSON.parse(read("package.json")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** The direct dependencies `package.json` declares, in both groups. */
function declaredDeps(): string[] {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ].sort();
}

/**
 * The set of package names a lockfile resolves, read from its `packages` map.
 * npm keys entries as `node_modules/<name>` (and `<name>` under nesting); bun
 * keys them as the bare `<name>`. Both are normalised to the bare name here.
 */
function resolvedNames(packages: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const key of Object.keys(packages)) {
    if (!key) continue; // npm's root entry is the empty string
    const bare = key.replace(/^.*node_modules\//, "");
    if (bare) names.add(bare);
  }
  return names;
}

function packageLockResolved(): Set<string> {
  const lock = JSON.parse(read("package-lock.json")) as {
    packages?: Record<string, unknown>;
  };
  return resolvedNames(lock.packages ?? {});
}

function bunLockResolved(): Set<string> {
  const lock = parseJsonc(read("bun.lock")) as {
    packages?: Record<string, unknown>;
  };
  return resolvedNames(lock.packages ?? {});
}

/** Direct deps of a lockfile that declare none of them — the drift to catch. */
function unresolvedIn(resolved: Set<string>): string[] {
  return declaredDeps().filter((name) => !resolved.has(name));
}

test("the coverage check sees a missing resolution and ignores a present one (self-test)", () => {
  const declared = ["next", "qrcode"];
  const resolved = new Set(["next"]);
  assert.deepEqual(
    declared.filter((name) => !resolved.has(name)),
    ["qrcode"],
  );

  const npmKeys = { "node_modules/next": {}, "node_modules/@scope/pkg": {} };
  assert.deepEqual(
    [...resolvedNames(npmKeys)].sort(),
    ["@scope/pkg", "next"],
  );

  const bunKeys = { next: [], qrcode: [] };
  assert.deepEqual([...resolvedNames(bunKeys)].sort(), ["next", "qrcode"]);
});

test("bun.lock's workspace manifest matches package.json exactly (gate)", () => {
  const lock = parseJsonc(read("bun.lock")) as {
    workspaces?: Record<
      string,
      { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    >;
  };
  const workspace = lock.workspaces?.[""] ?? {};

  for (const group of ["dependencies", "devDependencies"] as const) {
    const declared = Object.keys(manifest[group] ?? {}).sort();
    const locked = Object.keys(workspace[group] ?? {}).sort();
    assert.deepEqual(
      locked,
      declared,
      `bun.lock ${group} drifted from package.json — run \`bun install\``,
    );
  }
});

test("bun.lock resolves every direct dependency (gate)", () => {
  assert.deepEqual(unresolvedIn(bunLockResolved()), []);
});

test(
  "package-lock.json resolves every direct dependency",
  { todo: "package-lock.json (the only manifest Dependabot audits) omits qrcode, web-push, jsqr and pngjs and pins a stale lucide-react; the advisory scan reads a tree that is not what CI installs (owner: LANE-INFRA, #188)" },
  () => {
    assert.deepEqual(unresolvedIn(packageLockResolved()), []);
  },
);
