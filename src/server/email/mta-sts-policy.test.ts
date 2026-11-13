import assert from "node:assert/strict";
import test from "node:test";

import { buildMtaStsPolicy, MTA_STS_POLICY_ID } from "./mta-sts-policy";

test("MTA-STS policy carries the RFC 8461 required fields", () => {
  const body = buildMtaStsPolicy(["receive-euw1.forge.rmta.net"]);
  assert.match(body, /^version: STSv1$/m);
  assert.match(body, /^mode: testing$/m);
  assert.match(body, /^mx: receive-euw1\.forge\.rmta\.net$/m);
  assert.match(body, /^max_age: \d+$/m);
  // `testing` is the safe first-rollout mode; `enforce` would reject mail.
  assert.doesNotMatch(body, /mode: enforce/);
  assert.match(MTA_STS_POLICY_ID, /^\d{14}$/);
});

test("MTA-STS policy lists every MX host and drops blanks", () => {
  const body = buildMtaStsPolicy(["a.example", "  b.example  ", "", "  "]);
  assert.match(body, /^mx: a\.example b\.example$/m);
});
