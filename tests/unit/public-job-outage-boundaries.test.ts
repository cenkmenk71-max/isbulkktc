import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("homepage keeps the rest of the experience available when job previews are unavailable", async () => {
  const page = await read("src/app/[locale]/page.tsx");
  const component = await read("src/components/home/home-job-search.tsx");

  assert.match(page, /error instanceof PublicJobDataUnavailableError/);
  assert.match(page, /resultsUnavailable/);
  assert.match(component, /resultsUnavailable \?\s*\(/);
  assert.match(component, /copy\("unavailable"\)/);
});

test("company directory distinguishes unavailable job employers from an empty result", async () => {
  const page = await read("src/app/[locale]/(public)/companies/page.tsx");

  assert.match(page, /error instanceof PublicJobDataUnavailableError/);
  assert.match(page, /jobCompaniesUnavailable/);
  assert.match(page, /t\("jobEmployersUnavailable"\)/);
  assert.match(page, /<CompanyDirectory companies=\{publishedCompanies\} \/>/);
});

test("localized route error boundary uses the Next.js reset callback for retry", async () => {
  const boundary = await read("src/app/[locale]/error.tsx");

  assert.match(boundary, /reset:\s*\(\)\s*=>\s*void/);
  assert.match(boundary, /LocaleError\(\{ error, reset \}/);
  assert.match(boundary, /onClick=\{reset\}/);
  assert.doesNotMatch(boundary, /retry:\s*\(\)\s*=>\s*void/);
});
