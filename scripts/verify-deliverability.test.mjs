import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDnsblAnswer,
  classifyDnsResult,
  classifyMtaStsPolicy,
  classifyResendStatus,
  classifyTransportSecurity,
  countSpfDnsLookups,
  dkimKeyBits,
  dkimKeyVerdict,
  evaluateBlocklistZone,
  interpretDnsResponse,
  isDirectRun,
  isRelaxedAligned,
  reverseIpv4,
  rootSpfVerdict,
  spfAuthorisesSender,
  spfIpEntries,
} from "./verify-deliverability.mjs";

/**
 * Real RSA public keys (SPKI DER, base64 — the exact form Resend publishes in
 * the DKIM `p=` tag), generated once with `node:crypto`. A synthetic byte string
 * would not prove the DER walk; these do.
 */
const RSA_512 =
  "MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMFSS4LAvZRSIN90i6z+eiI40nRMGbmcR7gHMiPWVOmJ7QrQYyChL2sAsf3rMCRASDH6PY/TQ8InZtG/dvRRVFUCAwEAAQ==";
const RSA_1024 =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8bZphd+KmTFBJHj81h0USojMEEF+YXYgEpLjQuAJEIgH6vxdS8cXwA2Vdc2HZwA0fDW6XrsHPWW0fcwdHXozSJp07yGz105lmFC9hYs9yekg/Jdnvkh13hzZanZafhp8Y7L6t+Vk1B5D+1QiwhAQNCCqkbfOsfYhvo6PWmfQn3wIDAQAB";
const RSA_2048 =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsWT/rdY2oMq38gUOvilvsmrHK7lbIIKefpVWwIq0X0+AZOzyLyAMWgqznp/fPRJpW1Ev1RrODW14aFXDJekmsv1G+xuuasUiEERSXCuiLOGe7cj7LbHl/j33VS8gozkuLevXlVaa9SIyoeIAMLU87kSqsZL07URyhHtWQ6bFO28h8clhbetd/z6mPcaR74yxHvRx+xy7aeXf1AnPuQs48/0ay7X1nLWjryuPZ3i7/afL8NFfGW3Za+KG5pfnkcPCijHWrhwzLoHG+3Ez0v0qs1+3Xd1oVdlcD8hjkYZfdN2tDBabBSMfY4deqVSatFoCHc4JJYGEwTOPjKCNKuQ4vwIDAQAB";



test("SPF lookup counting counts terms, not substrings", () => {
  // The regression: `_spf.mx.cloudflare.net` contains the word `mx`, which the
  // old whole-string regex counted as a second lookup.
  assert.equal(countSpfDnsLookups("v=spf1 include:_spf.mx.cloudflare.net ~all"), 1);
  assert.equal(countSpfDnsLookups("v=spf1 include:amazonses.com ~all"), 1);
  assert.equal(countSpfDnsLookups("v=spf1 a mx include:_spf.google.com ~all"), 3);
  assert.equal(countSpfDnsLookups("v=spf1 redirect=_spf.example.com"), 1);
  assert.equal(countSpfDnsLookups("v=spf1 ip4:1.2.3.4 ~all"), 0);
  assert.equal(countSpfDnsLookups(""), 0);
  assert.equal(countSpfDnsLookups("not an spf record"), 0);
});

test("SPF lookup counting ignores qualifiers and matches the 10-lookup boundary", () => {
  assert.equal(countSpfDnsLookups("v=spf1 -include:a.example +mx ~all"), 2);
  const ten = `v=spf1 ${Array.from({ length: 10 }, (_, i) => `include:a${i}.example`).join(" ")} ~all`;
  assert.equal(countSpfDnsLookups(ten), 10);
  assert.equal(countSpfDnsLookups(`${ten} include:eleven.example`), 11);
});

test("SPF authorisation recognises SES and Resend's Forge return path", () => {
  assert.equal(spfAuthorisesSender("v=spf1 include:amazonses.com ~all"), true);
  assert.equal(spfAuthorisesSender("v=spf1 +include:amazonses.com ~all"), true);
  assert.equal(spfAuthorisesSender("v=spf1 include:amazonses.com. ~all"), true);
  // `-include` rejects the sender and `~`/`?` do not authorise it, so none of
  // those may read as PASS.
  assert.equal(spfAuthorisesSender("v=spf1 -include:amazonses.com ~all"), false);
  assert.equal(spfAuthorisesSender("v=spf1 ~include:amazonses.com ~all"), false);
  // A Return-Path subdomain that names concrete sending IPs also authorises a
  // sender; a root record that only includes an unrelated routing service does not.
  assert.equal(spfAuthorisesSender("v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ~all"), true);
  assert.equal(spfAuthorisesSender("v=spf1 include:_spf.mx.cloudflare.net ~all"), false);
  assert.equal(spfAuthorisesSender("v=spf1 -all"), false);
});

test("SPF authorisation is not fooled by a host that merely contains amazonses.com", () => {
  // The regression: the old substring match accepted these as "authorised",
  // reporting PASS for a record that authorises an unrelated host.
  assert.equal(spfAuthorisesSender("v=spf1 include:notamazonses.com ~all"), false);
  assert.equal(spfAuthorisesSender("v=spf1 include:amazonses.com.evil.example ~all"), false);
  assert.equal(spfAuthorisesSender("v=spf1 include:evil.example/amazonses.com ~all"), false);
  // A record whose only ip4 entry is unrelated still authorises *a* sender, which
  // is the intended (looser) second signal for a Return-Path subdomain.
  assert.equal(spfAuthorisesSender("v=spf1 ip4:203.0.113.7 ~all"), true);
});

test("SPF ip entries are extracted with their family and mask stripped", () => {
  assert.deepEqual(spfIpEntries("v=spf1 ip4:52.3.252.119 ip4:199.249.231.0/24 ~all"), [
    { family: 4, address: "52.3.252.119" },
    { family: 4, address: "199.249.231.0" },
  ]);
  assert.deepEqual(spfIpEntries("v=spf1 ip6:2001:db8::/32 -ip4:10.0.0.1 ~all"), [
    { family: 6, address: "2001:db8::" },
    { family: 4, address: "10.0.0.1" },
  ]);
  assert.deepEqual(spfIpEntries("v=spf1 include:amazonses.com ~all"), []);
  // Mechanism names are case-insensitive (RFC 7208 §4.6.1): `IP4:` is `ip4:`.
  assert.deepEqual(spfIpEntries("v=spf1 IP4:52.3.252.119 ~all"), [
    { family: 4, address: "52.3.252.119" },
  ]);
  assert.deepEqual(spfIpEntries("v=spf1 IP6:2001:db8::/32 ~all"), [
    { family: 6, address: "2001:db8::" },
  ]);
});

test("DNS result distinguishes an absent name from a failed query", () => {
  assert.equal(classifyDnsResult({ answers: ["v=spf1"], error: null }), "present");
  assert.equal(classifyDnsResult({ answers: [], error: null }), "absent");
  assert.equal(classifyDnsResult({ answers: [], error: "ENOTFOUND" }), "error");
  assert.equal(classifyDnsResult({ answers: [], error: "HTTP 503" }), "error");
});

test("DNSBL answers separate listings, refusals and clean results", () => {
  assert.deepEqual(classifyDnsblAnswer(["127.0.0.2"]), { state: "listed", codes: ["127.0.0.2"] });
  assert.deepEqual(classifyDnsblAnswer(["127.0.0.10", "127.0.0.4"]), {
    state: "listed",
    codes: ["127.0.0.10", "127.0.0.4"],
  });
  // Spamhaus documents these as errors, not listings — the old check read them
  // as "not listed" (a silent false pass).
  assert.deepEqual(classifyDnsblAnswer(["127.255.255.254"]), { state: "refused", codes: [] });
  assert.deepEqual(classifyDnsblAnswer(["127.255.255.252"]), { state: "refused", codes: [] });
  assert.deepEqual(classifyDnsblAnswer(["127.255.255.255"]), { state: "refused", codes: [] });
  assert.deepEqual(classifyDnsblAnswer([]), { state: "clean", codes: [] });
  assert.deepEqual(classifyDnsblAnswer(undefined), { state: "clean", codes: [] });
});

test("DNSBL query form reverses the IPv4 octets", () => {
  assert.equal(reverseIpv4("104.21.29.3"), "3.29.21.104");
  assert.equal(reverseIpv4("1.2.3.4"), "4.3.2.1");
  assert.equal(reverseIpv4("not-an-ip"), null);
  assert.equal(reverseIpv4("1.2.3"), null);
  assert.equal(reverseIpv4("1.2.3.4.5"), null);
});

test("a blocklist zone is only trusted when its sentinel answers as listed", () => {
  // Sentinel lists, target clean → a real clean verdict.
  assert.deepEqual(
    evaluateBlocklistZone({ sentinel: ["127.0.0.2"], target: [] }),
    { state: "clean" },
  );
  // Sentinel lists, target lists → a real hit.
  assert.deepEqual(
    evaluateBlocklistZone({ sentinel: ["127.0.0.2"], target: ["127.0.0.4"] }),
    { state: "listed", codes: ["127.0.0.4"] },
  );
  // Sentinel refused → the zone cannot be trusted, so a clean target means nothing.
  assert.deepEqual(
    evaluateBlocklistZone({ sentinel: ["127.255.255.254"], target: [] }),
    { state: "unqueryable" },
  );
  assert.deepEqual(evaluateBlocklistZone({ sentinel: [], target: [] }), { state: "unqueryable" });
  // Target refused even with a good sentinel → also unqueryable.
  assert.deepEqual(
    evaluateBlocklistZone({ sentinel: ["127.0.0.2"], target: ["127.255.255.254"] }),
    { state: "unqueryable" },
  );
  // A *failed* target query (SERVFAIL/timeout) is not a clean verdict either.
  assert.deepEqual(
    evaluateBlocklistZone({
      sentinel: { codes: ["127.0.0.2"], error: null },
      target: { codes: [], error: "ESERVFAIL" },
    }),
    { state: "unqueryable" },
  );
  assert.deepEqual(
    evaluateBlocklistZone({
      sentinel: { codes: [], error: "ETIMEOUT" },
      target: { codes: [], error: null },
    }),
    { state: "unqueryable" },
  );
});

test("DMARC relaxed alignment covers the Return-Path subdomain", () => {
  assert.equal(isRelaxedAligned("send.isbulkktc.com", "isbulkktc.com"), true);
  assert.equal(isRelaxedAligned("isbulkktc.com", "isbulkktc.com"), true);
  assert.equal(isRelaxedAligned("isbulkktc.com", "send.isbulkktc.com"), true);
  assert.equal(isRelaxedAligned("evil-example.com", "isbulkktc.com"), false);
  assert.equal(isRelaxedAligned("", "isbulkktc.com"), false);
});

test("a resolver failure is an error, not an absent record", () => {
  // Regression: the DoH JSON resolver reports RCODEs in `Status`, not as an HTTP
  // error, so a SERVFAIL/REFUSED answer arrived as HTTP 200 with no `Answer` and
  // was read as "record absent" — a false FAIL. NXDOMAIN (Status 3) *is* absent.
  assert.deepEqual(interpretDnsResponse(3, undefined), { answers: [], error: null });
  assert.deepEqual(interpretDnsResponse(0, [{ data: "v=spf1 ~all" }]), {
    answers: ["v=spf1 ~all"],
    error: null,
  });
  assert.deepEqual(interpretDnsResponse(0, undefined), { answers: [], error: null });
  for (const code of [1, 2, 5]) {
    const result = interpretDnsResponse(code, undefined);
    assert.equal(result.error, `DNS Status ${code}`);
    assert.equal(classifyDnsResult(result), "error");
  }
  // NXDOMAIN still classifies as absent, which is what makes an SPF/DKIM record
  // genuinely missing a real FAIL rather than a skip.
  assert.equal(classifyDnsResult(interpretDnsResponse(3, undefined)), "absent");
});

test("the direct-run guard fires even when the script path holds a space or #", () => {
  // The naive `file://${argv[1]}` guard never equals `import.meta.url` when the
  // path holds a space or `#`, so `node`-invoked runs exited 0 having verified
  // nothing. `pathToFileURL` percent-encodes both, so the guard matches.
  const url = "file:///tmp/verify%23guard%20x/verify-deliverability.mjs";
  assert.equal(isDirectRun(url, "/tmp/verify#guard x/verify-deliverability.mjs"), true);
  // A plain path still matches.
  assert.equal(isDirectRun("file:///repo/scripts/verify-deliverability.mjs", "/repo/scripts/verify-deliverability.mjs"), true);
  // A missing argv[1] (imported, not launched) must never fire.
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, ""), false);
  // A different script on the same path must not fire.
  assert.equal(isDirectRun("file:///repo/scripts/other.mjs", "/repo/scripts/verify-deliverability.mjs"), false);
});

test("an unqueryable Return-Path subdomain is a skip, never a FAIL", () => {
  // The regression: the root record does not authorise the sender and the
  // Return-Path subdomain query fails (transient SERVFAIL). The old code
  // collapsed the error to `aligned:false` and emitted a hard FAIL — "no aligned
  // Return-Path subdomain does either" — a false negative for a state that is
  // unknown, not negative. The script's own header forbids exactly this.
  assert.equal(
    rootSpfVerdict({ rootAuthorises: false, aligned: false, queryFailed: true }),
    "skip",
  );
  // A subdomain that answered and does not authorise is still a real FAIL.
  assert.equal(
    rootSpfVerdict({ rootAuthorises: false, aligned: false, queryFailed: false }),
    "fail",
  );
  // The root record authorising the sender is a pass regardless.
  assert.equal(
    rootSpfVerdict({ rootAuthorises: true, aligned: false, queryFailed: true }),
    "pass",
  );
  // A DMARC-aligned subdomain that does authorise is the warn case.
  assert.equal(
    rootSpfVerdict({ rootAuthorises: false, aligned: true, queryFailed: false }),
    "warn",
  );
});

test("a Resend rate limit or outage is a warn, not a FAIL that blames the key", () => {
  // The regression: every non-OK response was recorded as `fail` with the message
  // "API rejected the key". A 429 (rate_limit_exceeded / daily_quota_exceeded) or
  // a 5xx (application_error / service_unavailable) says nothing about the key —
  // and `fail` exits non-zero, so a busy provider read as a broken credential.
  assert.equal(classifyResendStatus(429), "warn");
  assert.equal(classifyResendStatus(500), "warn");
  assert.equal(classifyResendStatus(503), "warn");
  // A deterministic client rejection is a real FAIL: 401/403 mean the key itself
  // was rejected (validation_error / restricted_api_key / suspended_api_key).
  assert.equal(classifyResendStatus(401), "fail");
  assert.equal(classifyResendStatus(403), "fail");
  assert.equal(classifyResendStatus(400), "fail");
  assert.equal(classifyResendStatus(422), "fail");
});

test("dkimKeyBits reads the true RSA modulus size, not the string length", () => {
  // The core deliverability bug: the old check failed only below 100 characters,
  // so the live 1024-bit key (~216 chars) — half the recommended strength — read
  // as PASS. Length cannot tell a 1024-bit key from a 2048-bit one; the DER walk
  // can. These three are real keys of the stated size.
  assert.equal(dkimKeyBits(RSA_512), 512);
  assert.equal(dkimKeyBits(RSA_1024), 1024);
  assert.equal(dkimKeyBits(RSA_2048), 2048);
  // A 2048-bit key is longer than a 1024-bit one, so a length rule would pass
  // both; only the parsed modulus separates them.
  assert.ok(RSA_2048.length > RSA_1024.length);
});

test("dkimKeyBits returns null for a value it cannot parse, never a guess", () => {
  assert.equal(dkimKeyBits(""), null);
  assert.equal(dkimKeyBits(undefined), null);
  assert.equal(dkimKeyBits(null), null);
  // Valid base64 that is not a DER SubjectPublicKeyInfo.
  assert.equal(dkimKeyBits("aGVsbG8gd29ybGQ="), null);
  // A truncated key: base64 decodes but the outer SEQUENCE is incomplete.
  assert.equal(dkimKeyBits(RSA_2048.slice(0, 60)), null);
});

test("dkimKeyVerdict applies the RFC 8301 floor and treats Resend's fixed 1024 as info", () => {
  // Below the floor is a real fail.
  assert.equal(dkimKeyVerdict(512), "fail");
  // The floor is `info`, not `warn`: Resend does not support 2048-bit DKIM, so a
  // 1024-bit key has no owner action and must not be reported as a defect.
  assert.equal(dkimKeyVerdict(1024), "info");
  assert.equal(dkimKeyVerdict(2048), "pass");
  assert.equal(dkimKeyVerdict(4096), "pass");
  // An unreadable size must not read as a broken key: `unknown`, never `fail`.
  assert.equal(dkimKeyVerdict(null), "unknown");
  assert.equal(dkimKeyVerdict(undefined), "unknown");
  assert.equal(dkimKeyVerdict(0), "unknown");
  assert.equal(dkimKeyVerdict(Number.NaN), "unknown");
});

test("transport-security verdicts treat a missing record as a warn, a failed query as a skip", () => {
  // Both records present and well-formed.
  const healthy = classifyTransportSecurity({
    mtaSts: { answers: ["v=STSv1; id=20250101"], error: null },
    tlsRpt: { answers: ["v=TLSRPTv1; rua=mailto:tls@isbulkktc.com"], error: null },
  });
  assert.deepEqual(healthy.map((r) => [r.area, r.status]), [
    ["MTA-STS", "pass"],
    ["TLS-RPT", "pass"],
  ]);

  // Absent records are a posture gap to close — warn, and the detail says it does
  // not affect outbound placement, so a spam-folder complaint is not misread as
  // being fixed here.
  const missing = classifyTransportSecurity({
    mtaSts: { answers: [], error: null },
    tlsRpt: { answers: [], error: null },
  });
  assert.deepEqual(missing.map((r) => [r.area, r.status]), [
    ["MTA-STS", "warn"],
    ["TLS-RPT", "warn"],
  ]);
  for (const r of missing) assert.match(r.detail, /does not affect outbound placement/);

  // A name that exists but carries the wrong TXT does nothing — warn, not pass.
  const wrongType = classifyTransportSecurity({
    mtaSts: { answers: ["something else"], error: null },
    tlsRpt: { answers: ["something else"], error: null },
  });
  assert.deepEqual(wrongType.map((r) => [r.area, r.status]), [
    ["MTA-STS", "warn"],
    ["TLS-RPT", "warn"],
  ]);

  // A failed query is a fact about us, not the zone: skip, never warn/fail.
  const errored = classifyTransportSecurity({
    mtaSts: { answers: [], error: "DNS Status 2" },
    tlsRpt: { answers: [], error: "HTTP 500" },
  });
  assert.deepEqual(errored.map((r) => [r.area, r.status]), [
    ["MTA-STS", "skip"],
    ["TLS-RPT", "skip"],
  ]);
});


test("MTA-STS policy classifier flags redirects and accepts a served policy", () => {
  // A redirect is the classic misconfiguration: RFC 8461 §3.3 forbids following
  // one, so a policy behind a 301/308 is one senders never read. It must read as
  // a warning, never as a pass.
  const redirect = classifyMtaStsPolicy({ status: 308, body: "", error: null });
  assert.equal(redirect.status, "warn");
  assert.match(redirect.detail, /redirects \(HTTP 308\)/);

  const notFound = classifyMtaStsPolicy({ status: 404, body: "", error: null });
  assert.equal(notFound.status, "warn");
  assert.match(notFound.detail, /HTTP 404/);

  // A served policy is a pass, and `testing` is a deliberate first-rollout mode,
  // not a fault — only `none` reads as a warning.
  const testing = classifyMtaStsPolicy({
    status: 200,
    body: "version: STSv1\nmode: testing\nmx: receive-euw1.forge.rmta.net\nmax_age: 604800",
    error: null,
  });
  assert.deepEqual(testing, { status: "pass", detail: "policy served, version STSv1, mode testing" });

  const enforce = classifyMtaStsPolicy({ status: 200, body: "version: STSv1\nmode: enforce\n", error: null });
  assert.equal(enforce.status, "pass");

  const none = classifyMtaStsPolicy({ status: 200, body: "version: STSv1\nmode: none\n", error: null });
  assert.equal(none.status, "warn");

  // Wrong version and a missing mode are warnings; a fetch failure is a skip.
  assert.equal(classifyMtaStsPolicy({ status: 200, body: "version: STSv2\n", error: null }).status, "warn");
  assert.equal(classifyMtaStsPolicy({ status: 200, body: "version: STSv1\n", error: null }).status, "warn");
  assert.equal(classifyMtaStsPolicy({ status: 0, body: "", error: "ENOTFOUND" }).status, "skip");
});
