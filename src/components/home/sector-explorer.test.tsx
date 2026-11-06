import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import { type AppLocale } from "@/i18n/routing";

import { SectorDirectory } from "./sector-directory";
import { SectorExplorer } from "./sector-explorer";

/**
 * The sector explorer was the one surface that kept Latin digits on `/fa`: the
 * caller passed `{ count: "{count}" }` — a literal string — and patched the
 * digit in with `.replace`, so ICU never saw a number (issue #361). These tests
 * render the component and assert on the output, so a future refactor cannot
 * quietly reintroduce the string path.
 *
 * The `fa` catalog still carries these three keys as bare `{count}` because the
 * LANE-İÇERİK side has not typed them yet, so the test supplies the typed form
 * itself: that is the contract the caller must satisfy once the keys are
 * `{count, number}`. The cards render `next/image`, which the node test runner
 * cannot interop, so the explorer is rendered with no sectors — the count
 * surfaces still render, which is exactly what is being pinned.
 */

const messages = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );

/** The Persian range (۰-۹), which is what `fa` must use for every count. */
const PERSIAN_DIGITS = /[\u06F0-\u06F9]/;
const LATIN_DIGITS = /[0-9]/;

function render(locale: AppLocale) {
  const catalog = messages(locale);
  // The caller passes a real number; the catalog must interpolate it as one.
  // Only `fa` needs the typed form supplied here — the Latin catalogs already
  // render the number as-is.
  if (locale === "fa") {
    catalog.HomePage.sectorTotalCount = "مجموع زمینه‌های شغلی: {count, number}";
    catalog.HomePage.sectorResultCountSingular =
      "تعداد زمینه‌های شغلی: {count, number}";
    catalog.HomePage.sectorResultCountPlural =
      "تعداد زمینه‌های شغلی: {count, number}";
  }

  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={catalog}>
      <SectorDirectory
        itemCount={16}
        openLabel="Keşfet"
        closeLabel="Kapat"
        featured={<div />}
      >
        <SectorExplorer
          sectors={[]}
          categories={[{ key: "digital", label: "Dijital" }]}
          labels={{
            title: "Başlık",
            description: "Açıklama",
            searchLabel: "Ara",
            searchPlaceholder: "Ara",
            filterLabel: "Filtre",
            allLabel: "Tümü",
            totalLabel: "alan",
            clearSearch: "Temizle",
            emptyTitle: "Boş",
            emptyDescription: "Boş açıklama",
            clearFilters: "Filtreleri temizle",
          }}
        />
      </SectorDirectory>
    </NextIntlClientProvider>,
  );
}

function segment(markup: string, pattern: RegExp): string {
  const match = markup.match(pattern);
  assert.ok(match, `expected markup to contain ${pattern}`);
  return match[0];
}

test("the sector explorer counts render in the locale's own numeral system", () => {
  const fa = render("fa");
  const tr = render("tr");

  const faSurfaces = {
    directoryBadge: segment(fa, /sector-directory-count"[^>]*>([^<]*)</),
    totalValue: segment(fa, /sector-explorer-total"[^>]*><strong>([^<]*)</),
    totalLabel: segment(fa, /sector-explorer-total" aria-label="([^"]*)"/),
    results: segment(fa, /sector-explorer-results[\s\S]*?<\/div>/),
    chip: segment(fa, /sector-filter-chip"[^>]*>[^<]*<span>([^<]*)</),
  };

  for (const [name, value] of Object.entries(faSurfaces)) {
    assert.match(value, PERSIAN_DIGITS, `fa ${name} must use Persian digits`);
    assert.doesNotMatch(
      value,
      LATIN_DIGITS,
      `fa ${name} must not keep Latin digits`,
    );
  }

  // The two-digit badge proves it is not only the single zero that formats.
  assert.match(faSurfaces.directoryBadge, /۱۶/);

  // The count is the same number, so the Latin locales are unchanged.
  assert.match(tr, /sector-directory-count"[^>]*>16</);
  assert.match(tr, /sector-explorer-total"[^>]*><strong>0<\/strong>/);
  assert.doesNotMatch(tr, PERSIAN_DIGITS);
});
