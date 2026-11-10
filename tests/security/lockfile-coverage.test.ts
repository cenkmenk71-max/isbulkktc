import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Supply-chain boundary: the repository carries exactly one lockfile, that
 * lockfile resolves the manifest it accompanies, and Dependabot watches the
 * ecosystem the build actually installs from.
 *
 * #188 was a blind spot rather than a harmless duplicate. `package-lock.json`
 * was a second, stale manifest and the only one Dependabot's npm ecosystem
 * read, so the advisory scan saw a tree that did not match what CI installed
 * while the real lockfile (`bun.lock`, the one `bun install --frozen-lockfile`
 * uses in every job) went unscanned. LANE-INFRA closed it in b1f8d62: the stale
 * lock is deleted and gitignored, and `.github/dependabot.yml` now watches the
 * `bun` ecosystem.
 *
 * The previous revision of this file read `package-lock.json` inside a `todo`
 * test. Once the file was gone that test threw `ENOENT` — and a `todo` never
 * fails the run, so the read error was invisible and the test measured nothing
 * at all. A boundary that only holds while the file it forbids is present is
 * not a boundary. The gate below asserts the closure instead: no npm lock is in
 * the tree and Dependabot is pointed at bun. A reintroduced `package-lock.json`
 * — the original blind spot — turns it red.
 *
 * The resolution invariant is deliberately narrow — direct dependencies only.
 * That is exactly what a lockfile is required to resolve, and it is stable
 * across lockfile versions (npm's `packages` keys are `node_modules/<name>`,
 * bun's are bare names). Transitive completeness is left alone; it drifts for
 * reasons unrelated to this boundary.
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

/** npm-family lockfiles this repository must never commit (bun is the manager). */
const FOREIGN_LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
] as const;

/**
 * The `package-ecosystem:` values in `.github/dependabot.yml`. There is no YAML
 * parser available to a plain `node:test` file, and the value is a quoted scalar
 * on its own line in every form Dependabot accepts, so it is read line by line.
 */
function dependabotEcosystems(text: string): string[] {
  return [
    ...text.matchAll(/^\s*-\s*package-ecosystem:\s*"?([a-z-]+)"?\s*$/gm),
  ].map((match) => match[1]);
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

test("the Dependabot-ecosystem extractor reads the ecosystem list (self-test)", () => {
  const sample = [
    "version: 2",
    "updates:",
    '  - package-ecosystem: "bun"',
    '    directory: "/"',
    "  - package-ecosystem: npm",
    '    directory: "/"',
  ].join("\n");
  assert.deepEqual(dependabotEcosystems(sample), ["bun", "npm"]);
  assert.deepEqual(dependabotEcosystems("version: 2\nupdates: []\n"), []);
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

test("the tree carries no npm lockfile, so the #188 blind spot cannot return (gate)", () => {
  for (const name of FOREIGN_LOCKFILES) {
    assert.equal(
      existsSync(new URL(name, root)),
      false,
      `${name} is back; a second, stale lockfile would again be the manifest Dependabot reads (#188)`,
    );
  }
  // A stray `npm install` must not be able to commit one.
  assert.match(
    read(".gitignore"),
    /^package-lock\.json$/m,
    "package-lock.json must stay gitignored while bun is the package manager",
  );
});

test("Dependabot watches the ecosystem the build installs from (gate)", () => {
  const ecosystems = dependabotEcosystems(read(".github/dependabot.yml"));
  assert.ok(
    ecosystems.includes("bun"),
    "dependabot.yml must watch the bun ecosystem — that is the lockfile CI installs (#188)",
  );
  assert.ok(
    !ecosystems.includes("npm"),
    "dependabot.yml must not watch npm: there is no npm lockfile to audit (#188)",
  );
});
