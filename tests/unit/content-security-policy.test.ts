import assert from "node:assert/strict";
import test from "node:test";
import { getScriptSrc } from "@/lib/security/csp";

test("the development CSP permits React's eval-based error diagnostics", () => {
  assert.match(getScriptSrc(true), /(?:^|\s)'unsafe-eval'(?:\s|$)/);
});

test("the production CSP does not permit eval", () => {
  assert.doesNotMatch(getScriptSrc(false), /(?:^|\s)'unsafe-eval'(?:\s|$)/);
});
