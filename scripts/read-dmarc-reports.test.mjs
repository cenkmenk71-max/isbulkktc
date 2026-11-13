import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";

import {
  extractReportXml,
  formatSummary,
  isDmarcReportMessage,
  isGzip,
  isZip,
  parseArgs,
  parseDmarcXml,
  pickReportAttachment,
  readZipEntries,
  summarizeReports,
} from "./read-dmarc-reports.mjs";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>9988776655</report_id>
    <date_range>
      <begin>1731369600</begin>
      <end>1731455999</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>isbulkktc.com</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>reject</p>
    <sp>reject</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>203.0.113.10</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers><header_from>isbulkktc.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>isbulkktc.com</domain><result>pass</result></dkim>
      <spf><domain>isbulkktc.com</domain><result>pass</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>198.51.100.7</source_ip>
      <count>3</count>
      <policy_evaluated>
        <disposition>reject</disposition>
        <dkim>fail</dkim>
        <spf>fail</spf>
      </policy_evaluated>
    </row>
    <identifiers><header_from>isbulkktc.com</header_from></identifiers>
    <auth_results>
      <dkim><domain>isbulkktc.com</domain><result>fail</result></dkim>
      <spf><domain>evil.example</domain><result>fail</result></spf>
    </auth_results>
  </record>
</feedback>`;

/**
 * Builds a real zip archive around one entry. Hand-built rather than committed
 * as base64 so the test exercises the reader against the exact byte layout the
 * spec defines, and can cover both `stored` and `deflate` entries.
 */
function buildZip(filename, content, method = 0) {
  const name = Buffer.from(filename, "utf8");
  const raw = Buffer.from(content, "utf8");
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const crc = crc32(raw) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  const localRecord = Buffer.concat([local, name, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);

  return Buffer.concat([localRecord, centralRecord, eocd]);
}

test("parseDmarcXml reads metadata, policy and every record", () => {
  const report = parseDmarcXml(SAMPLE_XML);
  assert.equal(report.orgName, "google.com");
  assert.equal(report.email, "noreply-dmarc-support@google.com");
  assert.equal(report.reportId, "9988776655");
  assert.equal(report.domain, "isbulkktc.com");
  assert.equal(report.policy.p, "reject");
  assert.equal(report.policy.pct, "100");
  assert.equal(report.records.length, 2);

  const [first, second] = report.records;
  assert.deepEqual(
    { ip: first.sourceIp, count: first.count, dkim: first.dkim, spf: first.spf, disp: first.disposition },
    { ip: "203.0.113.10", count: 5, dkim: "pass", spf: "pass", disp: "none" },
  );
  assert.equal(second.sourceIp, "198.51.100.7");
  assert.equal(second.count, 3);
  assert.equal(second.disposition, "reject");
  assert.equal(second.authSpfDomain, "evil.example");
});

test("parseDmarcXml returns null for XML that is not a DMARC report", () => {
  assert.equal(parseDmarcXml("<rss><channel></channel></rss>"), null);
  assert.equal(parseDmarcXml("not xml at all"), null);
  assert.equal(parseDmarcXml(""), null);
});

test("summarizeReports aggregates counts, dispositions and a verdict", () => {
  const summary = summarizeReports([parseDmarcXml(SAMPLE_XML)]);
  assert.equal(summary.reports, 1);
  assert.equal(summary.messages, 8);
  assert.equal(summary.passed, 5);
  assert.equal(summary.failed, 3);
  assert.deepEqual(summary.dispositions, { none: 5, quarantine: 0, reject: 3 });
  assert.deepEqual(summary.publishedPolicies, ["reject"]);
  assert.equal(summary.window.begin, "2024-11-12");
  assert.equal(summary.sources[0].ip, "203.0.113.10");
  assert.equal(summary.sources[0].count, 5);
  assert.equal(summary.sources[1].fail, 3);
  // Failures that actually reached reject is the signal worth surfacing.
  assert.equal(summary.verdict, "warn");
});

test("summarizeReports is ok when nothing failed", () => {
  const clean = SAMPLE_XML.replace(/<record>[\s\S]*<\/record>\s*<record>[\s\S]*<\/record>/, SAMPLE_XML.match(/<record>[\s\S]*?<\/record>/)[0]);
  const summary = summarizeReports([parseDmarcXml(clean)]);
  assert.equal(summary.failed, 0);
  assert.equal(summary.verdict, "ok");
  assert.equal(summarizeReports([]).messages, 0);
  // An empty inbox is its own verdict: "ok" would claim alignment was verified.
  assert.equal(summarizeReports([]).verdict, "empty");
  assert.match(formatSummary(summarizeReports([])), /EMPTY no reports read/);
});

test("alignment passes on either mechanism, not only both", () => {
  const dkimOnly = SAMPLE_XML.replace("<dkim>pass</dkim>\n        <spf>pass</spf>", "<dkim>pass</dkim>\n        <spf>fail</spf>");
  const summary = summarizeReports([parseDmarcXml(dkimOnly)]);
  // The first record still counts as aligned because DKIM passed.
  assert.equal(summary.passed, 5);
});

test("extractReportXml unwraps a bare document, gzip and zip", () => {
  const plain = extractReportXml(Buffer.from(SAMPLE_XML), "report.xml");
  assert.match(plain, /<feedback>/);

  const gz = extractReportXml(gzipSync(Buffer.from(SAMPLE_XML)), "report.xml.gz");
  assert.match(gz, /<feedback>/);

  const zipStored = extractReportXml(buildZip("report.xml", SAMPLE_XML, 0), "report.zip");
  assert.match(zipStored, /<feedback>/);

  // A deflated entry is the common case for reports from Microsoft.
  const zipDeflated = extractReportXml(buildZip("report.xml", SAMPLE_XML, 8), "report.zip");
  assert.match(zipDeflated, /<feedback>/);
});

test("extractReportXml sniffs the wrapper even with a misleading filename", () => {
  // Gzip bytes named ".xml" must still decompress.
  assert.match(extractReportXml(gzipSync(Buffer.from(SAMPLE_XML)), "report.xml"), /<feedback>/);
  // Zip bytes named without an extension must still be read as a zip.
  assert.match(extractReportXml(buildZip("report.xml", SAMPLE_XML), "attachment"), /<feedback>/);
});

test("isGzip and isZip recognise the magic bytes", () => {
  assert.equal(isGzip(gzipSync(Buffer.from("x"))), true);
  assert.equal(isGzip(Buffer.from(SAMPLE_XML)), false);
  assert.equal(isZip(buildZip("a.xml", SAMPLE_XML)), true);
  assert.equal(isZip(Buffer.from(SAMPLE_XML)), false);
});

test("readZipEntries returns every entry's decompressed data", () => {
  const entries = readZipEntries(buildZip("report.xml", SAMPLE_XML, 8));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "report.xml");
  assert.match(entries[0].data.toString("utf8"), /<feedback>/);

  assert.throws(() => readZipEntries(Buffer.from("not a zip")), /not a zip archive/);
});

test("isDmarcReportMessage keys on the attachment, then the recipient", () => {
  assert.equal(isDmarcReportMessage({ to: ["dmarc@isbulkktc.com"] }, []), true);
  assert.equal(
    isDmarcReportMessage({ to: ["info@isbulkktc.com"] }, [{ filename: "x.xml.gz" }]),
    true,
  );
  assert.equal(
    isDmarcReportMessage({ to: ["info@isbulkktc.com"] }, [{ filename: "photo.png" }]),
    false,
  );
  assert.equal(isDmarcReportMessage({ to: ["info@isbulkktc.com"] }, []), false);
});

test("pickReportAttachment prefers a report-looking filename", () => {
  const attachments = [{ filename: "logo.png" }, { filename: "google.com!isbulkktc.com!1.xml.gz" }];
  assert.equal(pickReportAttachment(attachments).filename, "google.com!isbulkktc.com!1.xml.gz");
  // With nothing report-shaped, the first attachment is still tried.
  assert.equal(pickReportAttachment([{ filename: "a.bin" }]).filename, "a.bin");
  assert.equal(pickReportAttachment([]), null);
});

test("formatSummary renders the headline numbers", () => {
  const text = formatSummary(summarizeReports([parseDmarcXml(SAMPLE_XML)]));
  assert.match(text, /messages {4}8 across 2 source IP/);
  assert.match(text, /PASS {8}5 aligned-pass/);
  assert.match(text, /FAIL {8}3 aligned-fail/);
  assert.match(text, /quarantine=0 reject=3/);
  assert.match(text, /WARN 3 message\(s\) were quarantined\/rejected/);
});

test("parseArgs pins the defaults and reads overrides", () => {
  const base = parseArgs([], {});
  assert.equal(base.days, 30);
  assert.equal(base.limit, 100);
  assert.equal(base.json, false);
  assert.equal(base.file, null);

  const args = parseArgs(["--days", "7", "--limit", "10", "--json", "--file", "./r.xml"], {});
  assert.equal(args.days, 7);
  assert.equal(args.limit, 10);
  assert.equal(args.json, true);
  assert.equal(args.file, "./r.xml");

  // A nonsense window falls back rather than scanning everything.
  assert.equal(parseArgs(["--days", "0"], {}).days, 30);
});
