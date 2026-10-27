import assert from "node:assert/strict";
import test from "node:test";

import { isCorruptedSupabaseAuthError } from "../../src/server/auth/supabase-guards";

test("detects stale Supabase auth cookies that failed JSON parsing", () => {
  assert.equal(
    isCorruptedSupabaseAuthError(
      new SyntaxError(
        "Unexpected non-whitespace character after JSON at position 942",
      ),
    ),
    true,
  );

  assert.equal(
    isCorruptedSupabaseAuthError(
      new Error("The current session could not be verified."),
    ),
    false,
  );
});
