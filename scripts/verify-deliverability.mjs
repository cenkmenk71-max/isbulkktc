#!/usr/bin/env node
/**
 * Deliverability verification — the "did the fix actually work" check.
 *
 * CI proves the code is correct. It cannot prove an email lands in an inbox,
 * because that depends on DNS, on the sending reputation, and on the receiving
 * server. This script checks the parts that are verifiable without a mailbox:
 *
 *   1. SPF, DKIM, DMARC — present, valid, and aligned with the From domain.
 *   2. MTA-STS and TLS-RPT — the inbound-transport posture (a note, not a
 *      placement cause; both describe mail this domain receives).
 *   3. Blocklists — is the sending domain or its sending IPs listed?
 *   4. Resend — is the API key valid and the domain verified?
 *
 * It reports what it measured and refuses to claim more. A record that could not
 * be queried is reported as `skip`, never as absent or clean: a network failure
 * must not read as "no record" (a false FAIL) or as "not listed" (a false PASS).
 * Inbox placement needs a real mailbox, which this script cannot supply.
 *
 * Usage:
 *   node scripts/verify-deliverability.mjs
 *   node scripts/verify-deliverability.mjs --domain example.com
 *   node scripts/verify-deliverability.mjs --send you@example.com
 *
 * Exit code is non-zero only on a real `fail`. `warn` and `skip` are notes.
 */

import { promises as dns } from "node:dns";
import { pathToFileURL } from "node:url";

/**
 * True when the module was launched directly (`node script.mjs`) rather than
 * imported by a test. `pathToFileURL` percent-encodes the path, so a directory
 * name holding a space or `#` still matches; the naive `file://${argv[1]}`
 * comparison never does, and the script exits 0 having verified nothing.
 */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}
const DOMAIN = argValue("--domain") ?? "isbulkktc.com";

/**
 * The owner-supplied mailboxes for the human-confirmed placement check.
 * `--send` alone uses these; `--send a@b` overrides.
 */
const DEFAULT_SEND_TO = [
  "muhammedali.kahraman@outlook.com",
  "m.ali.kahraman@outlook.com",
  "letgodeneme97@outlook.com",
];

const sendIndex = args.indexOf("--send");
const SEND_TO =
  sendIndex === -1
    ? []
    : args[sendIndex + 1] && !args[sendIndex + 1].startsWith("--")
      ? [args[sendIndex + 1]]
      : DEFAULT_SEND_TO;

/** The From domain end users see; the DMARC identity is aligned against it. */
const FROM_DOMAIN = DOMAIN;

/**
 * Resend sends through its own infrastructure and publishes the Return-Path on a
 * subdomain of the verified domain. The root-domain SPF does not describe that
 * path — the subdomain's does — so both are inspected. Resend's default is
 * `send`; newer accounts (this one) use `rsend`.
 */
const RETURN_PATH_SUBDOMAINS = ["send", "rsend"];

/**
 * Turns a Google DoH JSON response into the `{ answers, error }` shape the rest
 * of the script classifies. The JSON resolver reports DNS RCODEs in `Status`
 * (RFC 1035 §4.1.1), not as HTTP errors: a SERVFAIL or REFUSED answer is HTTP
 * 200 with `Status` 2/5 and no `Answer`, which the old code read as an empty
 * answer set — an absent record. NXDOMAIN (`Status` 3) *is* an absent name; any
 * other non-zero code is a resolver failure and must read as `error`, never as
 * `absent` (a false FAIL) or, downstream, `clean` (a false PASS).
 */
export function interpretDnsResponse(status, answerData) {
  const code = Number(status ?? 0);
  if (code === 3) return { answers: [], error: null };
  if (code !== 0) return { answers: [], error: `DNS Status ${code}` };
  return { answers: (answerData ?? []).map((a) => String(a?.data ?? "")), error: null };
}

/** Resolve a DNS record through Google's JSON resolver (no credentials). */
async function resolve(name, type) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const response = await fetch(url, { headers: { accept: "application/dns-json" } });
    if (!response.ok) return { answers: [], error: `HTTP ${response.status}` };
    const body = await response.json();
    return interpretDnsResponse(body.Status, body.Answer);
  } catch (error) {
    return { answers: [], error: error.message };
  }
}

/**
 * Turns a DNS result into a state a caller can act on. `absent` (the name
 * resolved to nothing) is a fact about the zone; `error` (the query failed) is a
 * fact about us and must never be folded into `absent`.
 */
export function classifyDnsResult({ answers, error }) {
  if (error) return "error";
  return (answers?.length ?? 0) > 0 ? "present" : "absent";
}

const SPF_DNS_TERMS = /^(?:include|a|mx|ptr|exists)(?::|\/|$)/i;
const SPF_REDIRECT = /^redirect=/i;

/**
 * Counts the SPF terms that trigger a DNS lookup — `include`, `a`, `mx`, `ptr`,
 * `exists`, and `redirect=` (RFC 7208 §4.6.4). The limit is 10; a record over it
 * makes receivers answer `permerror`.
 *
 * Matching must be per term, not per substring: the previous check searched the
 * whole string for the word `mx` and so counted the `mx` inside
 * `_spf.mx.cloudflare.net`, reporting 2 lookups for a single-include record and
 * inflating every count near the limit.
 */
export function countSpfDnsLookups(record) {
  const tokens = String(record).trim().split(/\s+/);
  if (tokens.length === 0 || !/^v=spf1$/i.test(tokens[0])) return 0;
  return tokens.slice(1).filter((token) => {
    const term = token.replace(/^[+\-~?]/, "");
    return SPF_DNS_TERMS.test(term) || SPF_REDIRECT.test(term);
  }).length;
}

/**
 * True when an SPF record authorises a concrete sending host: either it includes
 * Amazon SES (`include:amazonses.com`, Resend's documented path) or it names
 * specific `ip4:`/`ip6:` addresses. A Return-Path subdomain managed by Resend
 * uses one of these; a root domain that only lists unrelated includes (Cloudflare
 * routing, in this repo) does not, which is what distinguishes the two.
 */
export function spfAuthorisesSender(record) {
  if (spfIncludesAmazonses(record)) return true;
  return spfIpEntries(record).length > 0;
}

/**
 * True when the record carries the exact `include:amazonses.com` mechanism.
 *
 * The match must be the whole mechanism, not a substring of it: an unanchored
 * `…amazonses\.com` matched `include:notamazonses.com` and
 * `include:amazonses.com.evil.example`, so a record that authorises an unrelated
 * host read as "authorised". A trailing dot is the same name in DNS.
 *
 * Only the bare include and its `+` equivalent count. `-include` means the
 * sender is explicitly rejected and `~`/`?` mean soft-fail/neutral — none of
 * those authorise a sender, so they must not read as PASS either.
 */
function spfIncludesAmazonses(record) {
  for (const token of String(record).trim().split(/\s+/)) {
    const term = token.replace(/^\+/, "").toLowerCase();
    if (term === "include:amazonses.com" || term === "include:amazonses.com.") return true;
  }
  return false;
}

/**
 * `ip4:1.2.3.4` / `ip6:…` entries of an SPF record, with CIDR masks stripped.
 * Mechanism names are case-insensitive (RFC 7208 §4.6.1), so `IP4:` is the same
 * mechanism as `ip4:`; a case-sensitive match read such a record as having no
 * sender authorisation.
 */
export function spfIpEntries(record) {
  const out = [];
  for (const token of String(record).trim().split(/\s+/)) {
    const match = token.replace(/^[+\-~?]/, "").match(/^ip([46]):([0-9a-fA-F.:/]+)/i);
    if (!match) continue;
    out.push({ family: Number(match[1]), address: match[2].split("/")[0] });
  }
  return out;
}

/**
 * A DNSBL answer in the `127.0.0.0/8` space is a listing; `127.255.255.252`,
 * `.254`, and `.255` are error conditions (typing error, anonymous query through
 * a public resolver, too many queries) that Spamhaus documents as "should not be
 * taken to imply that the queried domain is listed". Reading a refusal as
 * `clean` is a false pass; reading it as `listed` is a false alarm. Both are
 * wrong, so it gets its own state.
 */
export function classifyDnsblAnswer(codes) {
  const list = (codes ?? []).map(String);
  const listed = list.filter((code) => /^127\.0\.(?:0|1)\.\d+$/.test(code));
  if (listed.length > 0) return { state: "listed", codes: listed };
  if (list.some((code) => /^127\.255\.255\.(?:252|254|255)$/.test(code))) {
    return { state: "refused", codes: [] };
  }
  return { state: "clean", codes: [] };
}

/**
 * DMARC relaxed alignment: the authenticated identifier shares an organizational
 * domain with the RFC5322.From domain. A subdomain relationship covers it here
 * (`rsend.isbulkktc.com` aligns with `isbulkktc.com`); a full PSL walk is not
 * needed for a single verified domain.
 */
export function isRelaxedAligned(authDomain, fromDomain) {
  if (!authDomain || !fromDomain) return false;
  const a = String(authDomain).toLowerCase().replace(/\.$/, "");
  const f = String(fromDomain).toLowerCase().replace(/\.$/, "");
  return a === f || a.endsWith(`.${f}`) || f.endsWith(`.${a}`);
}

/**
 * Decides the SPF verdict for the From domain's root record.
 *
 * The root record need not name the sending network when a DMARC-aligned
 * Return-Path subdomain does. But "the subdomain could not be queried" is *not*
 * "the subdomain does not authorise the sender": a transient DNS failure on the
 * subdomain must not turn into a hard FAIL, which is the false negative the
 * script's header forbids. That case is `skip` — the state is unknown, not
 * negative.
 */
export function rootSpfVerdict({ rootAuthorises, aligned, queryFailed }) {
  if (rootAuthorises) return "pass";
  if (aligned) return "warn";
  return queryFailed ? "skip" : "fail";
}

const results = [];
function record(area, status, detail) {
  results.push({ area, status, detail });
}

const ICON = { pass: "PASS", info: "INFO", warn: "WARN", fail: "FAIL", skip: "SKIP" };

async function checkSpf() {
  const root = await resolve(DOMAIN, "TXT");
  const state = classifyDnsResult(root);
  if (state === "error") {
    record("SPF", "skip", `could not query the root TXT records: ${root.error}`);
    return;
  }
  const spf = root.answers.find((t) => /^v=spf1(\s|$)/i.test(t));
  if (!spf) {
    record("SPF", "fail", "no v=spf1 record — receivers cannot verify the sender");
    return;
  }

  const lookups = countSpfDnsLookups(spf);
  const detail = `${spf} (${lookups} DNS-lookup term(s))`;

  // The From domain's own SPF is only part of the picture: when the Return-Path
  // is a subdomain, receivers check that subdomain's SPF for the envelope, and
  // DMARC relaxed alignment lets it align with the From domain. So a root record
  // that omits the sending network is not automatically a failure.
  const aligned = await returnPathAlignment();
  if (lookups > 10) {
    record("SPF", "warn", `${detail} — over the 10-lookup limit, receivers may permerror`);
  } else {
    const verdict = rootSpfVerdict({
      rootAuthorises: spfAuthorisesSender(spf),
      aligned: aligned.aligned,
      queryFailed: aligned.queryFailed,
    });
    if (verdict === "pass") {
      record("SPF", "pass", detail);
    } else if (verdict === "warn") {
      record(
        "SPF",
        "warn",
        `${detail} — the root record does not authorise the sender, but the Return-Path ` +
          `subdomain ${aligned.domain} does and is DMARC-aligned with ${FROM_DOMAIN}`,
      );
    } else if (verdict === "skip") {
      record(
        "SPF",
        "skip",
        `${detail} — the root record does not authorise the sender, and a Return-Path ` +
          `subdomain could not be queried, so whether the envelope aligns is unknown`,
      );
    } else {
      record(
        "SPF",
        "fail",
        `${detail} — does NOT authorise the sending network (amazonses.com) and no ` +
          `aligned Return-Path subdomain does either`,
      );
    }
  }

  if (aligned.checked) {
    for (const line of aligned.notes) record("SPF", aligned.aligned ? "pass" : "warn", line);
  }
}

/**
 * Inspects the Return-Path subdomains: does one carry an SPF record that
 * authorises the sending network, and does it align with the From domain?
 */
async function returnPathAlignment() {
  const notes = [];
  let queryFailed = false;
  for (const sub of RETURN_PATH_SUBDOMAINS) {
    const domain = `${sub}.${DOMAIN}`;
    const { answers, error } = await resolve(domain, "TXT");
    const state = classifyDnsResult({ answers, error });
    if (state === "error") {
      // A query failure on the subdomain is not evidence the subdomain lacks an
      // SPF record; record it so the caller can report `skip` rather than FAIL.
      queryFailed = true;
      notes.push(`${domain} TXT could not be queried: ${error}`);
      continue;
    }
    if (state !== "present") continue;
    const spf = answers.find((t) => /^v=spf1(\s|$)/i.test(t));
    if (!spf) continue;
    if (!spfAuthorisesSender(spf)) {
      notes.push(`${domain} SPF does not authorise the sending network: ${spf}`);
      continue;
    }
    const aligned = isRelaxedAligned(domain, FROM_DOMAIN);
    notes.push(
      `${domain} (Return-Path) SPF authorises the sender${aligned ? "" : " but is not aligned"}`,
    );
    return { checked: true, aligned, queryFailed, domain, notes };
  }
  return { checked: false, aligned: false, queryFailed, domain: null, notes };
}

/**
 * Reads the RSA modulus size, in bits, from a DKIM `p=` value, or `null` when
 * the value cannot be parsed.
 *
 * The old check judged the key only by its character count, which cannot tell a
 * 1024-bit key (~216 chars) from a 2048-bit one — so a weak key read as PASS.
 * The length is the only honest signal of strength, and it is not the same as
 * the strength: RFC 8301 sets 1024 as the floor and recommends 2048.
 *
 * The `p=` value is base64 of a DER `SubjectPublicKeyInfo`:
 *
 *   SEQUENCE { SEQUENCE { OID, NULL }, BIT STRING { SEQUENCE { INTEGER n, INTEGER e } } }
 *
 * The shape is fixed enough to walk by hand, and a malformed value returns
 * `null` (an honest "could not read it") rather than a guess.
 */
export function dkimKeyBits(p) {
  const der = Buffer.from(String(p ?? ""), "base64");
  // One DER TLV: tag, a short or long-form length, then that many content bytes.
  const read = (offset) => {
    if (offset + 2 > der.length) return null;
    const tag = der[offset];
    let length = der[offset + 1];
    let header = 2;
    if (length & 0x80) {
      const count = length & 0x7f;
      // 0x80 is indefinite length (not valid DER) and >4 length bytes is absurd.
      if (count === 0 || count > 4 || offset + 2 + count > der.length) return null;
      length = 0;
      for (let i = 0; i < count; i += 1) length = length * 256 + der[offset + 2 + i];
      header = 2 + count;
    }
    const start = offset + header;
    if (start + length > der.length) return null;
    return { tag, start, length, end: start + length };
  };

  const outer = read(0);
  if (!outer || outer.tag !== 0x30) return null;
  const algorithm = read(outer.start);
  if (!algorithm || algorithm.tag !== 0x30) return null;
  const bitString = read(algorithm.end);
  if (!bitString || bitString.tag !== 0x03) return null;
  // The BIT STRING content opens with a one-byte "unused bits" count (0 for a
  // DER key); the RSA public key SEQUENCE starts after it.
  const rsa = read(bitString.start + 1);
  if (!rsa || rsa.tag !== 0x30) return null;
  const modulus = read(rsa.start);
  if (!modulus || modulus.tag !== 0x02) return null;

  let bytes = modulus.length;
  let first = der[modulus.start];
  // A leading 0x00 keeps the INTEGER positive; it is not part of the value.
  if (first === 0) {
    bytes -= 1;
    first = der[modulus.start + 1];
  }
  if (bytes <= 0 || first === undefined) return null;
  let bits = bytes * 8;
  // Drop the leading zero bits of the top byte (e.g. 0x0F is four bits short).
  for (let mask = 0x80; mask > 0 && (first & mask) === 0; mask >>= 1) bits -= 1;
  return bits;
}

/**
 * RFC 8301 verdict for a DKIM key size. Below the 1024-bit floor is a real
 * `fail`. A 1024-bit key is `info`, not `warn`: Resend fixes every sending
 * domain at 1024-bit and "does not support 2048-bit DKIM keys" (Resend docs,
 * "Do You Need 2048-bit DKIM?"), so there is no owner action — flagging it as a
 * defect would send someone to rotate a key that cannot be rotated. 2048 and
 * above is `pass`. An unparseable size is `unknown`, never `fail`: the record
 * exists and may be fine, so a parser limitation must not read as a broken key.
 */
export function dkimKeyVerdict(bits) {
  if (typeof bits !== "number" || !Number.isFinite(bits) || bits <= 0) return "unknown";
  if (bits < 1024) return "fail";
  if (bits < 2048) return "info";
  return "pass";
}

async function checkDkim() {
  const { answers, error } = await resolve(`resend._domainkey.${DOMAIN}`, "TXT");
  const state = classifyDnsResult({ answers, error });
  if (state === "error") {
    record("DKIM", "skip", `could not query resend._domainkey: ${error}`);
    return;
  }
  const record_ = answers.find((t) => t.includes("p="));
  if (!record_) {
    record("DKIM", "fail", "no resend._domainkey record — Resend cannot sign");
    return;
  }
  const key = record_.match(/p=([A-Za-z0-9+/=]+)/)?.[1] ?? "";
  if (key.length < 100) {
    record("DKIM", "fail", `public key looks truncated (${key.length} chars)`);
    return;
  }
  const bits = dkimKeyBits(key);
  const verdict = dkimKeyVerdict(bits);
  if (verdict === "fail") {
    record(
      "DKIM",
      "fail",
      `resend._domainkey key is ${bits} bits — below the RFC 8301 floor of 1024`,
    );
    return;
  }
  if (verdict === "info") {
    record(
      "DKIM",
      "info",
      `resend._domainkey present, ${bits}-bit key — Resend fixes sending keys at 1024-bit ` +
        `and does not support 2048-bit DKIM, so no action; this is compliant (RFC 8301)`,
    );
    return;
  }
  if (verdict === "pass") {
    record("DKIM", "pass", `resend._domainkey present, ${bits}-bit key`);
    return;
  }
  record(
    "DKIM",
    "warn",
    `resend._domainkey present, key ${key.length} chars — could not read the modulus size`,
  );
}

async function checkDmarc() {
  const { answers, error } = await resolve(`_dmarc.${DOMAIN}`, "TXT");
  const state = classifyDnsResult({ answers, error });
  if (state === "error") {
    record("DMARC", "skip", `could not query _dmarc: ${error}`);
    return;
  }
  const dmarc = answers.find((t) => /^v=DMARC1/i.test(t));
  if (!dmarc) {
    record("DMARC", "fail", "no _dmarc record — receivers have no policy");
    return;
  }
  const policy = dmarc.match(/\bp=(\w+)/)?.[1] ?? "none";
  const hasRua = /\brua=/.test(dmarc);
  if (policy === "none") {
    record(
      "DMARC",
      "warn",
      `${dmarc} — p=none only monitors; a failing SPF/DKIM is not enforced`,
    );
    return;
  }
  record("DMARC", policy === "reject" ? "pass" : "warn", `${dmarc}${hasRua ? "" : " (no rua)"}`);
}

async function checkMx() {
  const { answers, error } = await resolve(DOMAIN, "MX");
  const state = classifyDnsResult({ answers, error });
  if (state === "error") {
    record("MX", "skip", `could not query MX records: ${error}`);
    return;
  }
  if (state === "absent") {
    record("MX", "warn", "no MX — inbound mail is not accepted (fine if intentional)");
    return;
  }
  record("MX", "pass", answers.join(", "));
}

/**
 * Turns the two inbound-transport records into verdicts. Both are about mail
 * this domain *receives* (MTA-STS pins the TLS a sender may use; TLS-RPT asks
 * senders to report delivery failures), so neither changes where *outbound*
 * mail lands — they are posture, and the detail says so, so an owner does not
 * read a warning here as the fix for a spam-folder complaint.
 *
 * A query that failed is `skip`; an absent record is `warn` (a gap to close,
 * not breakage). A present `_mta-sts` name without a `v=STSv1` TXT is `warn`:
 * the policy file alone does nothing.
 */
export function classifyTransportSecurity({ mtaSts, tlsRpt }) {
  const records = [];

  const mtaState = classifyDnsResult(mtaSts);
  if (mtaState === "error") {
    records.push({ area: "MTA-STS", status: "skip", detail: `could not query _mta-sts: ${mtaSts.error}` });
  } else if (mtaState === "present") {
    const sts = (mtaSts.answers ?? []).find((t) => /^v=STSv1/i.test(t));
    records.push(
      sts
        ? { area: "MTA-STS", status: "pass", detail: sts }
        : { area: "MTA-STS", status: "warn", detail: "_mta-sts TXT present but is not a v=STSv1 record" },
    );
  } else {
    records.push({
      area: "MTA-STS",
      status: "warn",
      detail:
        "no _mta-sts record — inbound transport encryption is not advertised " +
        "(a posture gap for received mail; it does not affect outbound placement)",
    });
  }

  const tlsState = classifyDnsResult(tlsRpt);
  if (tlsState === "error") {
    records.push({ area: "TLS-RPT", status: "skip", detail: `could not query _smtp._tls: ${tlsRpt.error}` });
  } else if (tlsState === "present") {
    const rpt = (tlsRpt.answers ?? []).find((t) => /^v=TLSRPTv1/i.test(t));
    records.push(
      rpt
        ? { area: "TLS-RPT", status: "pass", detail: rpt }
        : { area: "TLS-RPT", status: "warn", detail: "_smtp._tls TXT present but is not a v=TLSRPTv1 record" },
    );
  } else {
    records.push({
      area: "TLS-RPT",
      status: "warn",
      detail:
        "no _smtp._tls record — senders cannot report TLS failures " +
        "(a posture gap for received mail; it does not affect outbound placement)",
    });
  }

  return records;
}

async function checkTransportSecurity() {
  const [mtaSts, tlsRpt] = await Promise.all([
    resolve(`_mta-sts.${DOMAIN}`, "TXT"),
    resolve(`_smtp._tls.${DOMAIN}`, "TXT"),
  ]);
  for (const r of classifyTransportSecurity({ mtaSts, tlsRpt })) {
    record(r.area, r.status, r.detail);
  }
}

/**
 * Fetches the MTA-STS policy file with redirects disabled. A redirect is the
 * classic misconfiguration: the `_mta-sts` TXT record points senders at
 * `https://mta-sts.<domain>/.well-known/mta-sts.txt`, and RFC 8461 §3.3 forbids
 * following a redirect to reach it, so a policy served behind a 301/308 is one
 * senders never read. `redirect: "manual"` surfaces that as a non-200 instead of
 * silently following it.
 */
async function fetchMtaStsPolicy() {
  const url = `https://mta-sts.${DOMAIN}/.well-known/mta-sts.txt`;
  try {
    const response = await fetch(url, { redirect: "manual" });
    return { status: response.status, body: await response.text(), error: null };
  } catch (error) {
    return { status: 0, body: "", error: error.message };
  }
}

/**
 * Classifies the fetched policy file. The failures that actually stop senders
 * from honouring a policy — a redirect, a non-200, a missing `version: STSv1` —
 * are separated from the mode note, because `mode: testing` is a deliberate
 * first-rollout state and must not read as a fault.
 */
export function classifyMtaStsPolicy({ status, body, error }) {
  if (error) return { status: "skip", detail: `could not fetch the policy file: ${error}` };
  if (status >= 300 && status < 400) {
    return {
      status: "warn",
      detail: `policy file redirects (HTTP ${status}) — RFC 8461 forbids a redirect; serve 200 from mta-sts.${DOMAIN}`,
    };
  }
  if (status !== 200) {
    return { status: "warn", detail: `policy file returned HTTP ${status} (expected 200)` };
  }
  const version = /^version:\s*(\S+)/im.exec(body)?.[1];
  if (!/^STSv1$/i.test(version ?? "")) {
    return { status: "warn", detail: "policy file is not version STSv1" };
  }
  const mode = /^mode:\s*(\S+)/im.exec(body)?.[1]?.toLowerCase();
  if (mode === "none") {
    return { status: "warn", detail: "policy mode is none — the policy asks senders not to enforce" };
  }
  if (mode !== "testing" && mode !== "enforce") {
    return { status: "warn", detail: "policy file has no mode (testing|enforce)" };
  }
  return { status: "pass", detail: `policy served, version STSv1, mode ${mode}` };
}

async function checkMtaStsPolicy() {
  const result = classifyMtaStsPolicy(await fetchMtaStsPolicy());
  record("MTA-STS policy", result.status, result.detail);
}

/**
 * Blocklists, each with a *known-listed* sentinel used to prove the zone is
 * actually answering before any "clean" verdict is trusted.
 *
 * `kind` says which query form the zone wants: `domain` zones list domain names,
 * `ip` zones list reversed IPv4 addresses. The previous check sent the domain to
 * `zen.spamhaus.org` and `bl.spamcop.net` — both IP-only zones (Spamhaus: "Zen
 * lists numeric IP address zones only, it does not list domains") — so the answer
 * was always NXDOMAIN and every domain read as clean. `dnsbl.sorbs.net` was
 * dropped: SORBS was shut down on 2024-06-05.
 *
 * The sentinel matters because a public or filtering resolver is often *refused*
 * by Spamhaus, and a refusal surfaces as NXDOMAIN or `127.255.255.x` — both
 * indistinguishable from "not listed" unless a known-listed sentinel is queried
 * first. Without it, "clean" is a guess.
 */
const BLOCKLISTS = [
  // `dbltest.com` is Spamhaus's documented DBL test entry; it must answer a
  // listing for the zone to be considered reachable.
  { zone: "dbl.spamhaus.org", kind: "domain", sentinel: "dbltest.com" },
  // SURBL's test entry is `test` in front of the zone (SURBL "Testing").
  { zone: "multi.surbl.org", kind: "domain", sentinel: "test" },
  // `2.0.0.127` is the conventional always-listed IP used to prove an IP zone
  // answers (`127.0.0.2` in reversed form).
  { zone: "zen.spamhaus.org", kind: "ip", sentinel: "2.0.0.127" },
  { zone: "bl.spamcop.net", kind: "ip", sentinel: "2.0.0.127" },
];

/** Queries a DNSBL zone through the system resolver (public resolvers are refused). */
async function dnsbl(zone, name) {
  try {
    const codes = await dns.resolve4(`${name}.${zone}`);
    return { codes, error: null };
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      return { codes: [], error: null };
    }
    return { codes: [], error: error.code ?? error.message };
  }
}

/**
 * Decides one zone's verdict from its sentinel and target answers. A zone whose
 * sentinel does not come back as a listing is `unqueryable`: the resolver was
 * refused, so a clean target answer would be meaningless. A *failed* target
 * query (SERVFAIL, timeout) is likewise `unqueryable`, never `clean` — the
 * absence of an answer is not evidence of absence.
 *
 * Each argument is either a raw code array or a `{ codes, error }` result.
 */
export function evaluateBlocklistZone({ sentinel, target }) {
  const codes = (value) => (Array.isArray(value) ? value : value?.codes);
  const failed = (value) => !Array.isArray(value) && Boolean(value?.error);
  if (failed(sentinel)) return { state: "unqueryable" };
  if (classifyDnsblAnswer(codes(sentinel)).state !== "listed") return { state: "unqueryable" };
  if (failed(target)) return { state: "unqueryable" };
  const verdict = classifyDnsblAnswer(codes(target));
  if (verdict.state === "listed") return { state: "listed", codes: verdict.codes };
  if (verdict.state === "refused") return { state: "unqueryable" };
  return { state: "clean" };
}

/** Reverses an IPv4 address for the DNSBL query form (`1.2.3.4` → `4.3.2.1`). */
export function reverseIpv4(address) {
  const parts = String(address).trim().split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parts.reverse().join(".");
}

async function checkBlocklists() {
  const sendingIps = await sendingIpAddresses();
  const listed = [];
  const clean = [];
  const unqueryable = [];
  const unchecked = [];

  for (const list of BLOCKLISTS) {
    const names =
      list.kind === "domain" ? [DOMAIN] : sendingIps.map(reverseIpv4).filter(Boolean);
    const sentinel = await dnsbl(list.zone, list.sentinel);

    // Prove the zone answers before trusting any of its "clean" verdicts.
    if (classifyDnsblAnswer(sentinel.codes).state !== "listed") {
      unqueryable.push(list.zone);
      continue;
    }
    if (names.length === 0) {
      // No sending IP to query. Reporting this as `clean` would read as "checked
      // and not listed", which is not what happened — it was never checked.
      unchecked.push(list.zone);
      continue;
    }
    for (const name of names) {
      const target = await dnsbl(list.zone, name);
      const verdict = evaluateBlocklistZone({ sentinel, target });
      if (verdict.state === "listed") listed.push(`${name} on ${list.zone}`);
      else if (verdict.state === "unqueryable") unqueryable.push(`${list.zone} (${name})`);
      else clean.push(list.zone);
    }
  }

  if (listed.length > 0) {
    record("Blocklists", "fail", `listed: ${listed.join(", ")}`);
    return;
  }
  if (clean.length === 0) {
    record(
      "Blocklists",
      "skip",
      `no list could be queried (${[...unqueryable, ...unchecked].join(", ")}) — a ` +
        `public or filtering resolver is refused by Spamhaus; this is not a clean result`,
    );
    return;
  }
  const caveats = [
    unqueryable.length > 0 ? `unqueryable: ${unqueryable.join(", ")}` : "",
    unchecked.length > 0 ? `not queried (no sending IP): ${unchecked.join(", ")}` : "",
  ].filter(Boolean);
  const suffix = caveats.length > 0 ? `; ${caveats.join("; ")}` : "";
  record(
    "Blocklists",
    caveats.length > 0 ? "warn" : "pass",
    `not listed on ${[...new Set(clean)].join(", ")}${suffix}`,
  );
}

/** Sending IPs from the Return-Path subdomain's SPF `ip4:`/`ip6:` terms. */
async function sendingIpAddresses() {
  const ips = [];
  for (const sub of RETURN_PATH_SUBDOMAINS) {
    const { answers, error } = await resolve(`${sub}.${DOMAIN}`, "TXT");
    if (classifyDnsResult({ answers, error }) !== "present") continue;
    const spf = answers.find((t) => /^v=spf1(\s|$)/i.test(t));
    if (!spf) continue;
    for (const entry of spfIpEntries(spf)) {
      if (entry.family === 4) ips.push(entry.address);
    }
  }
  return ips;
}

/**
 * Maps a non-OK Resend HTTP status to a verdict. A 429 (`rate_limit_exceeded`,
 * `daily_quota_exceeded`) and any 5xx (`application_error`, `service_unavailable`)
 * are transient provider states: they say nothing about the key, so they are
 * `warn` (a note), never `fail`. A `fail` exits non-zero and would blame the
 * credential for a rate limit or an outage — the same false-negative class as an
 * unqueryable DNS record reading as "not present". Every other 4xx is a real,
 * deterministic rejection (401/403 = the key itself), so it stays `fail`.
 */
export function classifyResendStatus(status) {
  if (status === 429 || status >= 500) return "warn";
  return "fail";
}

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    record("Resend", "skip", "RESEND_API_KEY not set");
    return;
  }
  if (!key.startsWith("re_")) {
    record(
      "Resend",
      "fail",
      `key does not start with re_ (len ${key.length}) — likely the wrong secret`,
    );
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      const verdict = classifyResendStatus(response.status);
      const why =
        response.status === 429
          ? "rate limited — the key may be fine, retry later"
          : response.status >= 500
            ? "Resend API error — provider-side, retry later"
            : "API rejected the key";
      record("Resend", verdict, `${why} (HTTP ${response.status})`);
      return;
    }
    const body = await response.json();
    const found = (body.data ?? []).find((d) => d.name === DOMAIN);
    if (!found) {
      record("Resend", "fail", `${DOMAIN} is not added to the Resend account`);
      return;
    }
    record(
      "Resend",
      found.status === "verified" ? "pass" : "fail",
      `${DOMAIN} status=${found.status}`,
    );
  } catch (error) {
    record("Resend", "warn", `could not reach the Resend API: ${error.message}`);
  }
}

/**
 * Sends one test message through the Resend API and prints the provider id. This
 * is the only way to get real headers and a mail-tester score. It refuses to
 * claim success on a key that is known-invalid, so a broken key is a clear
 * `fail` rather than a silent no-op.
 */
async function sendTestEmail(to) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !key.startsWith("re_")) {
    record(
      "Send",
      "fail",
      "cannot send a test message: RESEND_API_KEY is missing or not a Resend key",
    );
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? `İşBul KKTC <no-reply@${DOMAIN}>`,
        to,
        subject: "isbulkktc deliverability test",
        text:
          "Deliverability probe sent by scripts/verify-deliverability.mjs. " +
          "Please report the folder it landed in (inbox or spam) and its headers.",
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const verdict = classifyResendStatus(response.status);
      const why =
        response.status === 429
          ? "rate limited — the message was not sent, retry later"
          : response.status >= 500
            ? "Resend API error — provider-side, the message was not sent"
            : "Resend rejected the message";
      record("Send", verdict, `${why} (HTTP ${response.status}): ${body.message ?? ""}`);
      return;
    }
    record(
      "Send",
      "pass",
      `sent to ${to} — provider id ${body.id ?? "(none)"}. Placement (inbox/spam) needs human confirmation.`,
    );
  } catch (error) {
    record("Send", "warn", `could not reach the Resend API: ${error.message}`);
  }
}

async function main() {
  console.log(`Deliverability check for ${DOMAIN}\n`);
  await checkSpf();
  await checkDkim();
  await checkDmarc();
  await checkMx();
  await checkTransportSecurity();
  await checkMtaStsPolicy();
  await checkBlocklists();
  await checkResend();
  for (const to of SEND_TO) await sendTestEmail(to);

  for (const r of results) {
    console.log(`  ${ICON[r.status].padEnd(4)} ${r.area.padEnd(15)} ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log(`\n${failed} failure(s), ${warned} warning(s), ${skipped} skipped`);
  console.log(
    "\nInbox placement (spam vs inbox) cannot be checked here — it needs a real\n" +
      "mailbox. Send to the owner-supplied addresses above to confirm placement.",
  );
  process.exit(failed > 0 ? 1 : 0);
}

// Only run when invoked directly, so the pure helpers stay importable in tests.
if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
