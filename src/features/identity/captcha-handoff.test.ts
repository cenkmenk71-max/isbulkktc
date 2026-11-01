import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// A Turnstile token is single-use. A form that renders `<TurnstileField>` but
// drives it with a plain `useActionState` re-submits a spent token on every
// retry, and Supabase answers `captcha_failed` — which hides the real error.
// Every form that shows the widget must therefore use `useCaptchaAction`, which
// resets it on submit. This is a static guard: it reads the feature source.
const featureDirectory = new URL("./", import.meta.url);

function formSources(): { name: string; source: string }[] {
  return readdirSync(featureDirectory)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, featureDirectory), "utf8"),
    }));
}

test("every form rendering the Turnstile widget resets it through useCaptchaAction", () => {
  const widgetForms = formSources().filter(({ source }) =>
    /<TurnstileField\b/.test(source),
  );

  assert.ok(
    widgetForms.length >= 3,
    "expected the auth forms to render the Turnstile widget",
  );

  for (const { name, source } of widgetForms) {
    assert.match(
      source,
      /useCaptchaAction\(/,
      `${name} renders <TurnstileField> without useCaptchaAction`,
    );
    assert.match(
      source,
      /<TurnstileField\s+resetSignal=\{resetSignal\}/,
      `${name} does not hand the reset signal to <TurnstileField>`,
    );
  }
});

test("the captcha notice copy is distinct from the generic captcha failure", () => {
  const languages = ["tr", "en", "ru", "el", "fa", "de"] as const;

  for (const language of languages) {
    const messages = (
      JSON.parse(
        readFileSync(
          new URL(`../../messages/${language}.json`, import.meta.url),
          "utf8",
        ),
      ) as { AuthForms: { messages: Record<string, string> } }
    ).AuthForms.messages;

    assert.ok(
      messages.captchaRequired?.length > 0,
      `${language}: AuthForms.messages.captchaRequired is missing`,
    );
    assert.notEqual(
      messages.captchaRequired,
      messages.captchaFailed,
      `${language}: captchaRequired must not reuse the captchaFailed copy`,
    );
  }
});
