import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { NextIntlClientProvider } from "next-intl";
import LocaleError from "../../src/app/[locale]/error";

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

test("localized route error gives recovery actions without exposing server errors", () => {
  for (const locale of locales) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../src/messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    );
    const supportReference = "safe-support-123";
    const error = Object.assign(
      new Error("private database connection details"),
      { digest: supportReference },
    );
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocaleError error={error} reset={() => undefined} />
      </NextIntlClientProvider>,
    );

    assert.match(markup, /role="alert"/);
    assert.match(markup, /<button[^>]*>.*?<\/button>/);
    assert.match(markup, /href="(?:\/|\/[a-z]{2})"/);
    assert.ok(markup.includes(messages.AppError.title));
    assert.ok(
      markup.includes(
        messages.AppError.supportReference.replace("{digest}", supportReference),
      ),
      "the safe support reference should be shown in every locale",
    );
    assert.doesNotMatch(markup, /private database connection details/);
  }
});
