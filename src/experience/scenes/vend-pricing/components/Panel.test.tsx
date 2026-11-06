import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";

import { type AppLocale } from "@/i18n/routing";

import { Panel } from "./Panel";

/**
 * The vend panel is the second surface that leaked Latin numerals into `/fa`
 * (issue #361, same class as the sector explorer): the price was formatted with
 * a hardcoded `"tr-TR"` — `₺1.290` beside the locale-aware `TRY ۱٬۲۹۰` in the
 * proposal list — and the decorative step markers were built with
 * `` `0${index + 1}` ``. Both now go through `Intl` with the page locale.
 */

const messages = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );

const PERSIAN_DIGITS = /[\u06F0-\u06F9]/;
const LATIN_DIGITS = /[0-9]/;

const plan = {
  id: "growth" as const,
  code: "growth",
  color: "#4b8066",
  listingCount: 3,
  prices: { 1: 590, 7: 1390, 30: 2790 } as Record<1 | 7 | 30, number>,
  name: "رشد",
  audience: "کارفرما",
  blurb: "خلاصه",
  features: ["انتشار هم‌زمان", "گزارش"],
};

function render(locale: AppLocale) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      <Panel
        backLabel="بازگشت"
        ctaLabel="ثبت‌نام"
        ctaTitle="حساب بسازید"
        durationGroupLabel="مدت"
        durationLabel="مدت انتشار"
        durationOptions={[{ days: 30, label: "Aylık" }]}
        heading={{ current: null }}
        locale={locale}
        onClose={() => {}}
        onDurationChange={() => {}}
        packageContentsLabel="دامنه بسته"
        plan={plan}
        priceSummary="مجموع بسته"
        quiet={false}
        quoteAction="درخواست"
        quoteEmailBody="مدت: %DAYS% روز"
        quoteEmailSubject="پیشنهاد"
        quoteInstructions="ایمیل"
        quoteTitle="قیمت اختصاصی"
        quoteUnavailable="در دسترس نیست"
        customPriceLabel="قیمت اختصاصی"
        salesContactEmail="sales@example.com"
        selectedDuration={30}
      />
    </NextIntlClientProvider>,
  );
}

test("the vend panel price and step markers use the page locale's numerals", () => {
  const fa = render("fa");
  const tr = render("tr");

  const faPrice = fa.match(/vend-panel-price-amount"[^>]*>([^<]*)</)?.[1];
  assert.ok(faPrice, "expected a rendered price");
  assert.match(faPrice, PERSIAN_DIGITS, "fa price must use Persian digits");
  assert.doesNotMatch(faPrice, LATIN_DIGITS, "fa price must not keep Latin digits");
  // 2790 → ۲٬۷۹۰ (Persian thousands separator, not Turkish "2.790").
  assert.match(faPrice, /\u06F2\u066C\u06F7\u06F9\u06F0/);

  // The decorative step markers are Persian too, and stay zero-padded.
  assert.match(fa, />\u06F0\u06F1</, "fa step marker must be ۰۱");
  assert.doesNotMatch(fa, /vend-panel-scope[\s\S]*?>0[12]</);

  // Latin locales keep their own grouping (Turkish "2.790").
  const trPrice = tr.match(/vend-panel-price-amount"[^>]*>([^<]*)</)?.[1];
  assert.ok(trPrice);
  assert.match(trPrice, /2\.790/);
  assert.doesNotMatch(tr, PERSIAN_DIGITS);
  assert.match(tr, />01</, "tr step marker must stay 01");
});
