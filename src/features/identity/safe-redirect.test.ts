import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPostAuthDestinationKey,
  getPostAuthDestinationPath,
  toPostAuthDestinationKey,
} from "./safe-redirect";

test("only the two known keys are accepted as post-auth destinations", () => {
  assert.equal(toPostAuthDestinationKey("candidate"), "candidate");
  assert.equal(toPostAuthDestinationKey("company"), "company");
  assert.equal(getPostAuthDestinationPath("candidate"), "/profile/dashboard");
  assert.equal(getPostAuthDestinationPath("company"), "/company/dashboard");
});

test("open-redirect payloads collapse to the default destination", () => {
  const payloads = [
    "https://evil.example/phish",
    "http://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>",
    "company/../../admin",
    "",
    " ",
    "Company",
    null,
    undefined,
  ];

  for (const payload of payloads) {
    assert.equal(
      toPostAuthDestinationKey(payload),
      defaultPostAuthDestinationKey,
      `${String(payload)} must not be trusted as a destination`,
    );
  }
});

test("prototype keys never resolve to an inherited value", () => {
  for (const payload of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(toPostAuthDestinationKey(payload), "candidate");
  }
});

test("the two destinations are same-origin absolute paths", () => {
  for (const key of ["candidate", "company"] as const) {
    const path = getPostAuthDestinationPath(key);
    assert.ok(path.startsWith("/"), `${path} must be root-relative`);
    assert.ok(!path.startsWith("//"), `${path} must not be protocol-relative`);
  }
});
