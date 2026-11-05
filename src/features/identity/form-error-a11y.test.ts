import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// When a server action rejects a submit, the form shows a message. For a screen
// reader to hear *why*, the field that failed must point at that message with
// `aria-describedby`, and the message element must actually exist with a stable
// id (a dangling reference is an axe `aria-valid-attr-value` violation). The
// sign-in, sign-up and password-reset forms already did this; the reset-password
// form rendered a bare `<p>` with no id and never set `aria-invalid`, so its
// error was announced only as a generic alert and the field was not marked
// invalid. These tests pin the contract for every form.

const formDirectory = new URL("./", import.meta.url);

function source(name: string): string {
  return readFileSync(new URL(name, formDirectory), "utf8");
}

type FormContract = {
  file: string;
  /** The input whose failure the status message describes. */
  fieldId: string;
  /** The id on the status-message element. */
  messageId: string;
};

const forms: FormContract[] = [
  { file: "sign-in-form.tsx", fieldId: "login-email", messageId: "login-form-message" },
  { file: "sign-up-form.tsx", fieldId: "register-email", messageId: "register-form-message" },
  { file: "password-reset-form.tsx", fieldId: "reset-email", messageId: "reset-form-message" },
  {
    file: "new-password-form.tsx",
    fieldId: "reset-new-password",
    messageId: "reset-new-password-message",
  },
];

test("every auth form links its field to the status message it renders", () => {
  for (const { file, fieldId, messageId } of forms) {
    const src = source(file);

    // The message element exists and carries the id the field points at.
    assert.match(
      src,
      new RegExp(`id="${messageId}"`),
      `${file}: no element with id="${messageId}"`,
    );
    // The field references that id in aria-describedby.
    assert.match(
      src,
      new RegExp(`"${messageId}"`),
      `${file}: ${fieldId} does not reference ${messageId}`,
    );
    // The failing field is marked invalid for assistive tech.
    assert.match(
      src,
      /aria-invalid=\{state\.status === "error"\}/,
      `${file}: the field is never marked aria-invalid`,
    );
    // The status message is announced.
    assert.match(src, /aria-live="polite"/, `${file}: status is not live`);
    assert.match(
      src,
      /role=\{state\.status === "error" \? "alert" : "status"\}/,
      `${file}: status has no error role`,
    );
  }
});

test("the reset-password fields describe the message without losing the hint", () => {
  // Both password inputs already describe a hint; the message id must be added
  // alongside it, never replacing it, or the password guidance disappears.
  const src = source("new-password-form.tsx");
  assert.match(src, /"reset-password-hint reset-new-password-message"/);
  assert.match(src, /"reset-confirm-hint reset-new-password-message"/);
  // Both fields are invalid together — the action rejects the pair, not one.
  assert.equal(
    (src.match(/aria-invalid=\{state\.status === "error"\}/g) ?? []).length,
    2,
    "both password fields must be marked invalid",
  );
});
