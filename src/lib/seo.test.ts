import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A landing page that renders zero results is a soft 404 when it answers
// `index, follow` with a self-canonical. `noIndexFollowMetadata` flips such a
// page to `noindex` while keeping `follow`, so its sibling links stay crawlable.
//
// `src/lib/seo.ts` imports a `server-only` boundary, so it cannot be imported
// from a plain `tsx` test. Like `auth-metadata.test.ts`, this pins the contract
// from the source text instead.

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("noIndexFollowMetadata keeps follow on while flipping index off", () => {
  const src = source("./seo.ts");
  const helper = src.slice(src.indexOf("export function noIndexFollowMetadata"));

  assert.match(helper, /index:\s*false/, "must set robots.index false");
  assert.match(helper, /follow:\s*true/, "must keep robots.follow true");
  assert.match(
    helper,
    /googleBot:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/,
    "must mirror the directive on googleBot",
  );
  // The spread carries the page's own title/canonical/alternates through.
  assert.match(helper, /\.\.\.metadata/, "must preserve the incoming metadata");
});

test("both zero-result landings wrap their metadata with the helper", () => {
  const district = source(
    "../app/[locale]/(public)/is-ilanlari/[district]/page.tsx",
  );
  const jobType = source("../app/[locale]/(public)/is-turleri/[type]/page.tsx");

  for (const [name, src, filterKey] of [
    ["district", district, "district"],
    ["job type", jobType, "jobType"],
  ] as const) {
    assert.match(
      src,
      /import\s*\{[\s\S]*?noIndexFollowMetadata[\s\S]*?\}\s*from\s*"@\/lib\/seo"/,
      `${name} page must import the helper`,
    );
    assert.match(
      src,
      new RegExp(
        `const \\{ total \\} = await searchPublicJobs\\(\\{ ${filterKey} \\}\\);\\s*if \\(total === 0\\) return noIndexFollowMetadata\\(metadata\\);`,
      ),
      `${name} page must noindex when the filtered search returns nothing`,
    );
  }
});
