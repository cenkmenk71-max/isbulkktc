import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildSeedSql } from "../../scripts/generate-managed-content-seed";

/**
 * `supabase/seed-managed-content.sql` is generated, never hand-edited, but
 * nothing stopped it drifting from the bundled content: the #345 FAQ rewording
 * and the six-language legal translations stayed in `faq.ts` / `src/messages/*`
 * while the committed seed kept the old copy. Because the DAL prefers the DB
 * row over the bundled fallback, `/sss` and `/about` kept serving the stale
 * text. This test regenerates the seed in memory and fails the moment the
 * committed file and its sources disagree.
 */

const seedPath = new URL("../../supabase/seed-managed-content.sql", import.meta.url);
const committed = readFileSync(seedPath, "utf8");

test("committed managed-content seed matches a fresh build from the bundled sources", async () => {
  const { sql } = await buildSeedSql();
  assert.equal(
    committed,
    sql,
    "supabase/seed-managed-content.sql is stale — run `bun run seed:managed-content`",
  );
});

test("seed build is deterministic", async () => {
  const first = await buildSeedSql();
  const second = await buildSeedSql();
  assert.equal(first.sql, second.sql);
});

test("seed carries the post-#345 FAQ copy, not the leaked source phrasing", () => {
  for (const leaked of [
    "sağlanan kaynaklardaki",
    "supplied source files",
    "bereitgestellten Quelldateien",
    "παρεχόμενες πηγές",
  ]) {
    assert.ok(
      !committed.includes(leaked),
      `seed still leaks the internal phrasing "${leaked}"`,
    );
  }
});

test("seed carries real per-locale legal translations, not Turkish fallbacks", () => {
  for (const locale of ["en", "ru", "el", "fa", "de"]) {
    const marker = `'legal.privacy', '${locale}', `;
    assert.ok(committed.includes(marker), `missing legal.privacy for ${locale}`);
  }
  assert.ok(committed.includes('"title":"Privacy Policy"'));
  assert.ok(committed.includes('"title":"Datenschutzerklärung"'));
});
