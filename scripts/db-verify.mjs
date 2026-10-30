#!/usr/bin/env node
/**
 * Docker-free database verification.
 *
 * `supabase test db` normally drives the Docker control plane (start the local
 * stack, reset the database, then run pgTAP). When Docker is unavailable — a
 * locked-down runner, a machine without a daemon, or a reviewer who only has a
 * connection string — the same suite runs against any reachable Postgres that
 * has the `pgtap` extension. The CLI needs no container to talk to a database:
 * `--db-url` opens a plain connection and streams the SQL files.
 *
 * Usage:
 *   npm run db:verify -- --url postgresql://user:pass@host:5432/postgres
 *   ISBULKKTC_DB_URL=postgresql://... npm run db:verify
 *   npm run db:verify -- --url "$URL" --push     # apply migrations first
 *
 * `--push` runs `supabase db push --db-url` so a fresh branch or an empty
 * Postgres receives this repo's migrations before the suite. Never point
 * `--push` at a database that holds data you care about.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);

function readFlag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

const dbUrl = readFlag("--url") ?? process.env.ISBULKKTC_DB_URL ?? "";
const shouldPush = argv.includes("--push");

if (!dbUrl) {
  console.error(
    [
      "No database URL supplied.",
      "",
      "Provide one of:",
      "  npm run db:verify -- --url postgresql://user:pass@host:5432/postgres",
      "  ISBULKKTC_DB_URL=postgresql://... npm run db:verify",
      "",
      "The target must have the pgtap extension available. Supabase projects and",
      "branches ship it; a system Postgres needs `create extension pgtap`.",
    ].join("\n"),
  );
  process.exit(2);
}

/** Prefer the pinned project dependency over a global CLI of unknown version. */
function resolveLocalCli() {
  const executable = process.platform === "win32" ? "supabase.exe" : "supabase";
  const candidates = [
    path.join(projectRoot, "node_modules", "@supabase", "cli-linux-x64", "bin", executable),
    path.join(projectRoot, "node_modules", "@supabase", "cli-darwin-arm64", "bin", executable),
    path.join(projectRoot, "node_modules", "@supabase", "cli-darwin-x64", "bin", executable),
    path.join(projectRoot, "node_modules", "@supabase", "cli-windows-x64", "bin", executable),
    path.join(projectRoot, "node_modules", ".bin", executable),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const cli = resolveLocalCli() ?? "supabase";

function run(args, label) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(cli, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${label} could not start. Run \`npm install\` first.`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

if (shouldPush) {
  run(["db", "push", "--db-url", dbUrl], "Applying migrations to the target database");
}

run(["test", "db", "--db-url", dbUrl], "Running the pgTAP suite over a plain connection");

console.log(
  "\n✓ Database suite passed without the Docker control plane.\n" +
    "  The Docker path (`npm run test:db`) is still the default for the local stack.\n",
);
