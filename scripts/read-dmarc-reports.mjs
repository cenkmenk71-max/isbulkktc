#!/usr/bin/env node
// Reads the DMARC aggregate (RUA) reports that arrive at `dmarc@isbulkktc.com`
// and turns them into one readable answer: is our mail passing DMARC, and is
// anything being rejected?
//
// Why this exists: the `_dmarc` record now says `p=reject`, which is the point
// where the question stops being "is DMARC configured?" and becomes "what does
// DMARC actually see?". That answer only exists in the reports the mailbox
// receives — XML attachments sent by Google, Microsoft and others — and reading
// them by hand means unzipping a file and eyeballing per-IP rows. This script
// fetches them through Resend's receiving API, decompresses whatever wrapper the
// reporter chose (`.xml`, `.xml.gz`, `.zip`), and aggregates.
//
// The parsing is dependency-free on purpose: the XML/zip libraries in
// `node_modules` are transitive dependencies of unrelated packages, so reaching
// into them would break the moment that package changes. `node:zlib` covers
// gzip; the zip reader below covers the small, fixed shape DMARC reports use.
//
// Usage:
//   RESEND_API_KEY=<re_…> node scripts/read-dmarc-reports.mjs
//   RESEND_API_KEY=<re_…> node scripts/read-dmarc-reports.mjs --days 30 --json
//   node scripts/read-dmarc-reports.mjs --file ./report.xml.gz   # offline
//
// Environment:
//   RESEND_API_KEY   Resend key with access to the receiving inbox (required
//                    unless --file is given)

import { readFileSync } from "node:fs";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const API = "https://api.resend.com";
const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 100;

/** True when the module was launched directly, not imported by a test. */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

/** Parses the CLI flags. Pure, so a test can pin the defaults and overrides. */
export function parseArgs(argv, env = process.env) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const days = Number.parseInt(value("--days") ?? String(DEFAULT_DAYS), 10);
  const limit = Number.parseInt(value("--limit") ?? String(DEFAULT_LIMIT), 10);
  return {
    days: Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS,
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    file: value("--file") ?? null,
    json: argv.includes("--json"),
    now: env.DMARC_NOW ? new Date(env.DMARC_NOW) : new Date(),
  };
}

/** The first two bytes of a gzip stream. */
export function isGzip(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/** The `PK\x03\x04` local-file signature every zip archive starts with. */
export function isZip(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/** The end-of-central-directory record signature. */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

function findEndOfCentralDirectory(buffer) {
  // The EOCD is at the end, but a trailing comment of up to 65535 bytes may
  // follow it, so scan back from the end for the signature.
  const earliest = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= earliest; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/**
 * Reads every entry of a zip archive. Walks the central directory (not the local
 * headers) because the local header may defer its sizes to a trailing data
 * descriptor, which is legal and which some reporters emit.
 */
export function readZipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error("not a zip archive (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries.map((entry) => ({ ...entry, data: readLocalEntry(buf, entry) }));
}

function readLocalEntry(buffer, entry) {
  if (buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new Error(`zip entry "${entry.name}" has no local header`);
  }
  const nameLen = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLen = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`zip entry "${entry.name}" uses unsupported compression method ${entry.method}`);
}

/**
 * Turns whatever wrapper a reporter sent into XML text: a bare `.xml`, a gzip
 * stream, or a zip holding one XML. The content is sniffed as well as the
 * filename, because reporters are inconsistent about extensions.
 */
export function extractReportXml(buffer, filename = "") {
  const name = String(filename).toLowerCase();
  if (isZip(buffer) || name.endsWith(".zip")) {
    const entries = readZipEntries(buffer);
    const chosen = entries.find((entry) => /\.xml$/i.test(entry.name)) ?? entries[0];
    if (!chosen) throw new Error("zip archive has no entries");
    return chosen.data.toString("utf8");
  }
  if (isGzip(buffer) || name.endsWith(".gz")) {
    return gunzipSync(buffer).toString("utf8");
  }
  return (Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer))).toString("utf8");
}

/** The inner text of the first `<tag>` in `node`, or null. */
function text(node, tag) {
  const match = String(node).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

/** The inner text of the first `<tag>…</tag>` block in `node`, or null. */
function block(node, tag) {
  const match = String(node).match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? match[1] : null;
}

/** Every `<tag>…</tag>` block in `text`. */
function blocks(text, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const found = [];
  let match;
  while ((match = pattern.exec(String(text))) !== null) found.push(match[1]);
  return found;
}

/**
 * Parses one DMARC aggregate report. Returns `null` when the document is not a
 * `<feedback>` report, so a caller can skip unrelated XML instead of throwing.
 * Every field is optional in the RFC; missing ones become `null` rather than
 * being invented.
 */
export function parseDmarcXml(xml) {
  const source = String(xml);
  if (!/<feedback[\s>]/i.test(source)) return null;

  const metadata = block(source, "report_metadata") ?? "";
  const dateRange = block(metadata, "date_range") ?? "";
  const published = block(source, "policy_published") ?? "";

  const records = blocks(source, "record").map((record) => {
    const row = block(record, "row") ?? "";
    const evaluated = block(row, "policy_evaluated") ?? "";
    const identifiers = block(record, "identifiers") ?? "";
    const authResults = block(record, "auth_results") ?? "";
    const authDkim = block(authResults, "dkim") ?? "";
    const authSpf = block(authResults, "spf") ?? "";
    const count = Number.parseInt(text(row, "count") ?? "1", 10);
    return {
      sourceIp: text(row, "source_ip"),
      count: Number.isFinite(count) ? count : 1,
      disposition: (text(evaluated, "disposition") ?? "").toLowerCase() || null,
      dkim: (text(evaluated, "dkim") ?? "").toLowerCase() || null,
      spf: (text(evaluated, "spf") ?? "").toLowerCase() || null,
      headerFrom: text(identifiers, "header_from"),
      authDkimResult: (text(authDkim, "result") ?? "").toLowerCase() || null,
      authDkimDomain: text(authDkim, "domain"),
      authSpfResult: (text(authSpf, "result") ?? "").toLowerCase() || null,
      authSpfDomain: text(authSpf, "domain"),
    };
  });

  return {
    orgName: text(metadata, "org_name"),
    email: text(metadata, "email"),
    reportId: text(metadata, "report_id"),
    domain: text(published, "domain"),
    policy: {
      p: text(published, "p"),
      sp: text(published, "sp"),
      pct: text(published, "pct"),
      adkim: text(published, "adkim"),
      aspf: text(published, "aspf"),
    },
    dateRange: {
      begin: text(dateRange, "begin"),
      end: text(dateRange, "end"),
    },
    records,
  };
}

/**
 * True when a message looks like a DMARC report: it was addressed to the report
 * inbox, or it carries an XML/gzip/zip attachment. The attachment test is the
 * reliable one; the recipient test catches a report whose attachment the API
 * has not listed yet.
 */
export function isDmarcReportMessage(email, attachments = []) {
  const recipients = [
    ...(Array.isArray(email?.to) ? email.to : []),
    ...(Array.isArray(email?.received_for) ? email.received_for : []),
  ].map((value) => String(value).toLowerCase());
  const list = Array.isArray(attachments) ? attachments : [];
  const hasReportAttachment = list.some((entry) =>
    /\.(xml|xml\.gz|gz|zip)$/i.test(String(entry?.filename ?? "")),
  );
  return hasReportAttachment || recipients.some((value) => value.includes("dmarc@"));
}

/** The `YYYY-MM-DD` date `days` before `now`, in UTC. */
function windowStart(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The attachment whose filename looks like a report, or the first one. */
export function pickReportAttachment(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  return list.find((entry) => /\.(xml|xml\.gz|gz|zip)$/i.test(String(entry?.filename ?? ""))) ?? list[0] ?? null;
}

/**
 * Aggregates parsed reports into the numbers the runbook cares about: how many
 * messages were seen, how many aligned, and how many were dispositioned
 * quarantine/reject. Alignment passes when either the aligned DKIM or the
 * aligned SPF result is `pass` — that is the DMARC definition, and treating a
 * single mechanism as sufficient avoids calling a legitimate, DKIM-only sender a
 * failure.
 */
export function summarizeReports(reports) {
  const list = (Array.isArray(reports) ? reports : []).filter(Boolean);
  const sources = new Map();
  const reporters = new Map();
  let messages = 0;
  let passed = 0;
  let failed = 0;
  const dispositions = { none: 0, quarantine: 0, reject: 0 };
  const policies = new Set();
  let begin = null;
  let end = null;

  for (const report of list) {
    if (report.orgName) reporters.set(report.orgName, (reporters.get(report.orgName) ?? 0) + 1);
    if (report.policy?.p) policies.add(report.policy.p);
    const reportBegin = Number(report.dateRange?.begin);
    const reportEnd = Number(report.dateRange?.end);
    if (Number.isFinite(reportBegin) && (begin === null || reportBegin < begin)) begin = reportBegin;
    if (Number.isFinite(reportEnd) && (end === null || reportEnd > end)) end = reportEnd;

    for (const record of report.records ?? []) {
      const count = Number.isFinite(record.count) ? record.count : 1;
      messages += count;
      const aligned = record.dkim === "pass" || record.spf === "pass";
      if (aligned) passed += count;
      else failed += count;
      const disposition = record.disposition ?? "none";
      if (disposition in dispositions) dispositions[disposition] += count;
      else dispositions.none += count;

      const key = record.sourceIp ?? "unknown";
      const entry = sources.get(key) ?? { ip: key, count: 0, pass: 0, fail: 0, headerFrom: record.headerFrom ?? null };
      entry.count += count;
      if (aligned) entry.pass += count;
      else entry.fail += count;
      sources.set(key, entry);
    }
  }

  const topSources = [...sources.values()].sort((a, b) => b.count - a.count);
  const enforcement = dispositions.quarantine + dispositions.reject;
  // Three outcomes, not two: an empty inbox is neither a pass nor a problem, and
  // calling it "OK" would claim alignment was verified when nothing was read.
  const verdict = messages === 0 ? "empty" : failed > 0 && enforcement > 0 ? "warn" : "ok";

  return {
    reports: list.length,
    reporters: [...reporters.entries()].map(([name, count]) => ({ name, count })),
    publishedPolicies: [...policies],
    window: {
      begin: begin === null ? null : new Date(begin * 1000).toISOString().slice(0, 10),
      end: end === null ? null : new Date(end * 1000).toISOString().slice(0, 10),
    },
    messages,
    passed,
    failed,
    dispositions,
    sources: topSources,
    verdict,
  };
}

/**
 * Renders the summary as lines. `verdict` is `warn` when messages actually hit
 * the quarantine/reject policy — that is the signal to confirm the source IPs
 * are not senders we control, which is the whole reason to read these reports
 * after moving to `p=reject`.
 */
export function formatSummary(summary) {
  const lines = [];
  lines.push(`DMARC aggregate reports`);
  lines.push(
    `  reporters   ${summary.reporters.length}` +
      (summary.reporters.length > 0
        ? ` (${summary.reporters.map((entry) => entry.name).join(", ")})`
        : ""),
  );
  lines.push(
    `  window      ${summary.window.begin ?? "?"} → ${summary.window.end ?? "?"}`,
  );
  lines.push(
    `  policy      reports say p=${summary.publishedPolicies.join("/") || "?"} (live record: p=reject)`,
  );
  lines.push(`  messages    ${summary.messages} across ${summary.sources.length} source IP(s)`);
  lines.push(`  PASS        ${summary.passed} aligned-pass`);
  lines.push(`  FAIL        ${summary.failed} aligned-fail`);
  lines.push(
    `  disposition none=${summary.dispositions.none} quarantine=${summary.dispositions.quarantine} reject=${summary.dispositions.reject}`,
  );
  if (summary.sources.length > 0) {
    lines.push("  top sources:");
    for (const source of summary.sources.slice(0, 10)) {
      lines.push(
        `    ${source.ip.padEnd(40)} ${String(source.count).padStart(6)}  ` +
          `pass=${source.pass} fail=${source.fail}${source.headerFrom ? `  from=${source.headerFrom}` : ""}`,
      );
    }
  }
  if (summary.verdict === "warn") {
    lines.push(
      `  WARN ${summary.dispositions.quarantine + summary.dispositions.reject} message(s) were ` +
        "quarantined/rejected — confirm the failing source IPs above are not senders you control.",
    );
  } else if (summary.verdict === "empty") {
    lines.push("  EMPTY no reports read — nothing to conclude yet.");
  } else {
    lines.push("  OK  every reported message passed DMARC alignment.");
  }
  return lines.join("\n");
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend answered HTTP ${response.status} for ${url}: ${body?.message ?? body?.error ?? "unknown"}`);
  }
  return body;
}

/** Lists received emails, newest first, capped at `limit`. */
async function listReceived(token, limit) {
  const collected = [];
  let after = null;
  while (collected.length < limit) {
    const query = new URLSearchParams({ limit: String(Math.min(100, limit - collected.length)) });
    if (after) query.set("after", after);
    const body = await fetchJson(`${API}/emails/receiving?${query}`, token);
    const page = body.data ?? body.items ?? [];
    collected.push(...page);
    if (!body.has_more || page.length === 0) break;
    after = page[page.length - 1].id;
  }
  return collected.slice(0, limit);
}

async function listAttachments(token, emailId) {
  const body = await fetchJson(`${API}/emails/receiving/${emailId}/attachments`, token);
  return body.data ?? [];
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`attachment download failed (HTTP ${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

/** Parses one report from the API, returning `null` on any non-report failure. */
async function reportFromEmail(token, email, notes) {
  const attachments = await listAttachments(token, email.id);
  if (!isDmarcReportMessage(email, attachments)) return null;
  const attachment = pickReportAttachment(attachments);
  if (!attachment?.download_url) {
    notes.push(`${email.id}: report mail with no downloadable attachment — skipped`);
    return null;
  }
  try {
    const buffer = await download(attachment.download_url);
    const xml = extractReportXml(buffer, attachment.filename);
    const report = parseDmarcXml(xml);
    if (!report) {
      notes.push(`${email.id}: attachment "${attachment.filename}" is not a DMARC report — skipped`);
      return null;
    }
    return report;
  } catch (error) {
    notes.push(`${email.id}: could not parse "${attachment.filename}" (${error.message})`);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const notes = [];
  let reports = [];

  if (args.file) {
    const buffer = readFileSync(args.file);
    const xml = extractReportXml(buffer, args.file);
    const report = parseDmarcXml(xml);
    if (!report) {
      console.error(`${args.file} is not a DMARC aggregate report.`);
      process.exitCode = 1;
      return;
    }
    reports = [report];
  } else {
    const token = (process.env.RESEND_API_KEY ?? "").trim();
    if (!token) {
      console.error("RESEND_API_KEY is required (or pass --file to parse a local report).");
      process.exitCode = 1;
      return;
    }
    const cutoff = new Date(args.now.getTime() - args.days * 24 * 60 * 60 * 1000);
    const messages = await listReceived(token, args.limit);
    const recent = messages.filter((email) => {
      const created = email.created_at ? new Date(email.created_at) : null;
      return !created || created >= cutoff;
    });
    console.log(
      `${recent.length} message(s) received at the domain over the last ${args.days} day(s)` +
        ` (window from ${windowStart(args.now, args.days)}); checking for DMARC reports…`,
    );
    for (const email of recent) {
      const report = await reportFromEmail(token, email, notes);
      if (report) reports.push(report);
    }
  }

  const summary = summarizeReports(reports);
  if (args.json) {
    console.log(JSON.stringify({ summary, notes }, null, 2));
  } else {
    console.log("");
    console.log(formatSummary(summary));
    for (const note of notes) console.log(`  note: ${note}`);
  }

  // A run that found no reports is not a failure: a brand-new inbox legitimately
  // has none until reporters send their next batch. A run that found reports and
  // saw enforcement is a warning to review, not a broken build.
  if (summary.reports === 0) {
    console.log(
      "\nNo DMARC reports found yet. They arrive on each reporter's own schedule " +
        "(Google daily, others weekly) — re-run in a day or two.",
    );
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
