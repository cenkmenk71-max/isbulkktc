import assert from "node:assert/strict";
import test from "node:test";

import { clientIpFromHeaders } from "./request-context";

function fromMap(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

test("prefers the edge-written client address headers", () => {
  assert.equal(
    clientIpFromHeaders(
      fromMap({
        "cf-connecting-ip": "203.0.113.7",
        "x-real-ip": "198.51.100.9",
        "x-forwarded-for": "192.0.2.1, 10.0.0.1",
      }),
    ),
    "203.0.113.7",
  );

  assert.equal(
    clientIpFromHeaders(
      fromMap({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "192.0.2.1" }),
    ),
    "198.51.100.9",
  );
});

test("x-forwarded-for contributes only its leftmost entry", () => {
  assert.equal(
    clientIpFromHeaders(fromMap({ "x-forwarded-for": "192.0.2.1, 10.0.0.1, 10.0.0.2" })),
    "192.0.2.1",
  );
});

test("values are trimmed and blank entries fall through to unknown", () => {
  assert.equal(
    clientIpFromHeaders(fromMap({ "cf-connecting-ip": "  203.0.113.7  " })),
    "203.0.113.7",
  );
  assert.equal(clientIpFromHeaders(fromMap({ "cf-connecting-ip": "   " })), "unknown");
  assert.equal(clientIpFromHeaders(fromMap({})), "unknown");
});

test("reads the precedence from a real Headers instance", () => {
  const headers = new Headers({
    "x-forwarded-for": "192.0.2.1, 10.0.0.1",
  });
  assert.equal(clientIpFromHeaders((name) => headers.get(name)), "192.0.2.1");
});
