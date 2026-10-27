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
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocaleError
          error={new Error("private database connection details")}
          retry={() => undefined}
        />
      </NextIntlClientProvider>,
    );

    assert.match(markup, /role="alert"/);
    assert.match(markup, /<button[^>]*>.*?<\/button>/);
    assert.match(markup, /href="(?:\/|\/[a-z]{2})"/);
    assert.ok(markup.includes(messages.AppError.title));
    assert.doesNotMatch(markup, /private database connection details/);
  }
});
