import assert from "node:assert/strict";
import test from "node:test";

import { displayNameSchema, signUpSchema } from "./schemas";

// The display name is echoed to the header, the account panel and the welcome
// mail. The sign-up form used to accept any 2–80 character string, including
// control characters. Two concrete failures that this pins shut:
//
//  1. A NUL byte (U+0000) is not storable by Postgres for any character type
//     ("the character with code zero … cannot be stored", PostgreSQL 8.3), so the
//     `handle_new_auth_user` trigger's INSERT aborts and a sign-up the client
//     accepted fails server-side.
//  2. Newlines/tabs/DEL/C1 characters corrupt the rendered name, and bidi
//     overrides can reorder visible text.
//
// The set must match `public.oauth_profile_claims` (POSIX `[[:cntrl:]]`) and
// `deriveDisplayName`, so the stored name and the derived greeting cannot
// disagree.

const base = {
  email: "aday@example.com",
  password: "correct-horse",
  audience: "candidate",
  locale: "tr",
} as const;

test("a display name with control characters is rejected", () => {
  const rejected = [
    "\u0000\u0000", // NUL — not storable by Postgres
    "a\nb", // LF
    "a\r\nb", // CRLF
    "a\tb", // TAB
    "a\u007fb", // DEL
    "a\u0085b", // C1 (NEL)
    "a\u009fb", // C1
  ];

  for (const displayName of rejected) {
    assert.equal(
      displayNameSchema.safeParse(displayName).success,
      false,
      `${JSON.stringify(displayName)} must be rejected`,
    );
    assert.equal(
      signUpSchema.safeParse({ ...base, displayName }).success,
      false,
      `signUpSchema must reject ${JSON.stringify(displayName)}`,
    );
  }
});

test("ordinary names still pass, including Unicode and the bounds", () => {
  const accepted: [string, string][] = [
    ["Aday", "Aday"],
    ["  Aday  ", "Aday"], // trimmed
    ["Ayşe Yılmaz", "Ayşe Yılmaz"],
    ["Παπαδόπουλος", "Παπαδόπουλος"],
    ["محمد", "محمد"],
    ["😀😀", "😀😀"],
    ["a".repeat(80), "a".repeat(80)],
  ];

  for (const [input, expected] of accepted) {
    const result = displayNameSchema.safeParse(input);
    assert.equal(result.success, true, `${JSON.stringify(input)} must pass`);
    assert.equal(result.success && result.data, expected);
  }

  assert.equal(displayNameSchema.safeParse("A").success, false, "too short");
  assert.equal(
    displayNameSchema.safeParse("a".repeat(81)).success,
    false,
    "too long",
  );
});
