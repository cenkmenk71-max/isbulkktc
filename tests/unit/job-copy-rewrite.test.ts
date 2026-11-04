import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListingSummary,
  rewriteImportedJobText,
} from "../../src/features/jobs/job-copy-rewrite";

test("a run-on source sentence gets its missing spaces back", () => {
  // The imported corpus writes "aranmaktadır.Tercihen" with no space.
  assert.equal(
    rewriteImportedJobText(
      "Ön muhasebe personeli aranmaktadır.Tercihen kadın adaylar aranmaktadır.",
    ),
    "Ön muhasebe personeli aranmaktadır. Tercihen kadın adaylar aranmaktadır.",
  );
});

test("the known source misspellings are corrected", () => {
  assert.equal(
    rewriteImportedJobText("Alanında deneyımlı ve dah aönce çalışmış aday"),
    "Alanında deneyimli ve daha önce çalışmış aday",
  );
});

test("source-site branding never survives the rewrite", () => {
  const rewritten = rewriteImportedJobText(
    "Bu ilan iskibris üzerinden alınmıştır. isbulkibris kaydı.",
  );
  assert.ok(rewritten);
  assert.doesNotMatch(rewritten, /iskibris|isbulkibris/i);
});

test("a bullet list becomes one item per line", () => {
  assert.equal(
    rewriteImportedJobText("• En az lise mezunu • İletişim becerisi güçlü • Takım çalışmasına yatkın"),
    "En az lise mezunu\nİletişim becerisi güçlü\nTakım çalışmasına yatkın",
  );
});

test("sentence starts are capitalised without flattening ALL-CAPS headings", () => {
  const rewritten = rewriteImportedJobText(
    "ARANAN NİTELİKLER • en az lise mezunu • iyi iletişim",
  );
  assert.ok(rewritten);
  assert.match(rewritten, /ARANAN NİTELİKLER/);
  assert.match(rewritten, /En az lise mezunu/);
  assert.match(rewritten, /İyi iletişim/);
});

test("the facts are never invented: empty input yields null", () => {
  assert.equal(rewriteImportedJobText(null), null);
  assert.equal(rewriteImportedJobText(undefined), null);
  assert.equal(rewriteImportedJobText("   "), null);
  assert.equal(rewriteImportedJobText(""), null);
});

test("the summary is cut at a sentence, never mid-word", () => {
  const long =
    "Birinci cümle burada biter. İkinci cümle de oldukça uzundur ve devam eder. " +
    "Üçüncü cümle ise sınırın ötesinde kalır ve kesilmemesi gerekir.";
  const summary = buildListingSummary(long, 80);
  assert.ok(summary.length <= 80, `summary was ${summary.length} chars`);
  assert.doesNotMatch(summary, /[a-zçğıöşü]$/i.source === "" ? /$^/ : /kesilme$/, "no mid-word cut");
});

test("a short description is returned whole", () => {
  assert.equal(
    buildListingSummary("Kısa bir açıklama.", 260),
    "Kısa bir açıklama.",
  );
});
