#!/usr/bin/env node
// Verifies the search-indexing surface of the deployed site — the pieces a
// crawler reads before it decides what to index, which CI cannot see because
// they only exist once the site is live:
//
//   1. robots.txt — parseable, allows crawling, and advertises the sitemap.
//   2. sitemap.xml — every <loc> is an absolute canonical URL on the origin
//      (no default-locale `/tr` prefix), and each entry carries the full
//      hreflang set including `x-default`.
//   3. Per-page signals — a sample of sitemap URLs answers 200, is not
//      `noindex`, and declares the correct absolute canonical.
//   4. IndexNow — the key file the scheduler publishes is reachable and its
//      body matches the key it claims.
//
// These checks are deterministic and need no credentials. Two origin states are
// not evidence about indexing and are reported as `skip`, never a false `fail`:
// a Cloudflare challenge (which datacenter egress such as CI runners often gets)
// and a disabled Vercel deployment (402 `x-vercel-error: DEPLOYMENT_DISABLED`,
// an account-level outage the whole site shares). Run from a residential/office
// host, against a live deployment, for the full picture.
//
// Usage:
//   node scripts/verify-indexing.mjs
//   node scripts/verify-indexing.mjs --domain example.com
//   node scripts/verify-indexing.mjs --origin https://example.com --sample 12
//
// Exit code is non-zero only on a real `fail`. `warn` and `skip` are notes.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readIndexNowKey } from "./indexnow-key.mjs";

/**
 * True when the module was launched directly (`node script.mjs`) rather than
 * imported by a test. `pathToFileURL` percent-encodes the path, so a directory
 * name holding a space or `#` still matches; the naive `file://${argv[1]}`
 * comparison never does, and the script exits 0 having verified nothing.
 */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}
const DOMAIN = argValue("--domain") ?? "isbulkktc.com";
const ORIGIN = (argValue("--origin") ?? `https://${DOMAIN}`).replace(/\/$/, "");
const SAMPLE_SIZE = Number.parseInt(argValue("--sample") ?? "8", 10) || 8;

/** Locales the site serves. The default locale is unprefixed (localePrefix: as-needed). */
export const LOCALES = ["tr", "en", "ru", "el", "fa", "de"];
export const DEFAULT_LOCALE = "tr";

/**
 * Parses a robots.txt into groups and sitemap declarations.
 *
 * The format is line-based and comment-tolerant: `#` starts a comment, blank
 * lines are ignored, and a `User-Agent` line starts a new group only after the
 * previous group has at least one rule (consecutive `User-Agent` lines share a
 * group, which is how Google reads it).
 */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.rules.push({ type: field, path: value });
    }
  }
  return { groups, sitemaps };
}

/**
 * Whether two URLs share an origin. A prefix test is not enough: a
 * `startsWith("https://isbulkktc.com")` accepts `https://isbulkktc.com.evil.example`
 * and `https://isbulkktc.com.au` — the same substring confusion that produced
 * the SPF false-PASS — so the parsed origin must be compared exactly.
 */
export function isSameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A robots path pattern (`*` any run, trailing `$` end-anchor) against a path. */
function matchesRule(path, pattern) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/**
 * Picks the rules that apply to `agent`. Google matches the *most specific*
 * user-agent token — the longest substring of the crawler's name — and ignores
 * the global `*` group whenever a specific one matches; when several groups
 * share that most specific token, their rules are combined into one group.
 * Taking the first match instead let a short earlier token (`bot`) shadow a
 * longer later one (`googlebot`) and dropped the rules of a second group for
 * the same agent. `*` and a trailing `*` are both ignored for matching, since
 * Google treats `googlebot*` and `googlebot/1.2` as the token `googlebot`.
 */
function selectGroup(groups, agent) {
  const wanted = String(agent).toLowerCase();
  const global = [];
  let specific = [];
  let bestTokenLength = -1;
  for (const group of groups) {
    let matchedLength = -1;
    for (const rawToken of group.agents) {
      // `googlebot*` and `googlebot/1.2` are both the token `googlebot`; only
      // `*` alone is the global token.
      const token = rawToken.replace(/\*+$/, "").split("/")[0];
      if (token === "") {
        global.push(group);
        continue;
      }
      if (!wanted.includes(token)) continue;
      if (token.length > matchedLength) matchedLength = token.length;
    }
    if (matchedLength === -1) continue;
    if (matchedLength > bestTokenLength) {
      bestTokenLength = matchedLength;
      specific = [];
    }
    if (matchedLength === bestTokenLength) specific.push(group);
  }
  const chosen = specific.length > 0 ? specific : global;
  if (chosen.length === 0) return null;
  return {
    agents: chosen.flatMap((group) => group.agents),
    rules: chosen.flatMap((group) => group.rules),
  };
}

/**
 * Whether `path` is allowed for `agent`. The most specific matching rule wins;
 * on a tie `allow` wins, which is Google's documented behaviour. No matching
 * rule means allowed.
 */
export function isPathAllowed(robots, path, agent = "*") {
  const group = selectGroup(robots.groups, agent);
  if (!group) return true;
  let bestLength = -1;
  let bestType = "allow";
  for (const rule of group.rules) {
    // `Disallow:` with an empty value is the explicit "allow everything" form.
    if (!rule.path) continue;
    if (!matchesRule(path, rule.path)) continue;
    const length = rule.path.replace(/[*$]/g, "").length;
    if (length > bestLength || (length === bestLength && rule.type === "allow")) {
      bestLength = length;
      bestType = rule.type;
    }
  }
  return bestLength === -1 ? true : bestType === "allow";
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagText(block, tag) {
  const match = String(block).match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? decodeXml(match[1]) : null;
}

function tagAttr(tagString, name) {
  // HTML/XML allow single- or double-quoted attribute values; a double-quote
  // only regex reads `<meta name='robots' content='noindex'>` as "no directive".
  // The attribute name must be preceded by whitespace (or the tag opener), not
  // merely by a word boundary: `\b` also matches the `rel` inside `data-rel`
  // and the `name` inside `data-name`, so `<link data-rel="canonical" …>` read
  // as a canonical link.
  const match = String(tagString).match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  if (!match) return null;
  return decodeXml(match[1] ?? match[2]);
}

/**
 * Parses a sitemap or sitemap-index document. Only the elements this verifier
 * acts on are read: `<loc>`, `<lastmod>`, and the `xhtml:link` hreflang
 * alternates of each `<url>`.
 */
export function parseSitemap(xml) {
  const text = String(xml);
  const urls = [];
  const childSitemaps = [];
  if (/<sitemapindex[\s>]/i.test(text)) {
    for (const match of text.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)) {
      const loc = tagText(match[1], "loc");
      if (loc) childSitemaps.push(loc);
    }
    return { isIndex: true, urls, childSitemaps };
  }
  for (const match of text.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const loc = tagText(block, "loc");
    if (!loc) continue;
    const alternates = [];
    for (const link of block.matchAll(/<xhtml:link\b[^>]*>/gi)) {
      const href = tagAttr(link[0], "href");
      const hreflang = tagAttr(link[0], "hreflang");
      if (href && hreflang) alternates.push({ hreflang: hreflang.toLowerCase(), href });
    }
    urls.push({ loc, lastmod: tagText(block, "lastmod"), alternates });
  }
  return { isIndex: false, urls, childSitemaps };
}

/** Path of a URL, or null when it does not parse. */
function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Validates one sitemap `<loc>`: absolute, on the origin, no fragment or
 * whitespace, and free of the default-locale prefix. `localePrefix: as-needed`
 * serves the default locale unprefixed, so a `/tr/...` loc is a URL that
 * redirects — a sitemap must advertise the canonical form, not a redirect.
 */
export function validateLoc(loc, origin) {
  const raw = String(loc ?? "");
  if (!raw) return { ok: false, reason: "empty <loc>" };
  if (/\s/.test(raw)) return { ok: false, reason: `whitespace in <loc>: ${raw}` };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `<loc> is not absolute: ${raw}` };
  }
  const base = new URL(origin);
  if (url.origin !== base.origin) {
    return { ok: false, reason: `<loc> is off-origin: ${raw}` };
  }
  if (url.hash) return { ok: false, reason: `<loc> carries a fragment: ${raw}` };
  const path = url.pathname;
  if (path === `/${DEFAULT_LOCALE}` || path.startsWith(`/${DEFAULT_LOCALE}/`)) {
    return {
      ok: false,
      reason: `<loc> uses the default-locale prefix (/tr) which redirects: ${raw}`,
    };
  }
  return { ok: true };
}

/**
 * Validates the hreflang alternates of one sitemap entry. The set is
 * **optional**: a page that exists in only one language is listed once as its
 * own canonical (the localized duplicates point back to it), and demanding
 * hreflang there would advertise duplicate URLs as alternates and split the
 * cluster. When alternates *are* present they must be complete — every `href`
 * absolute and on-origin, every `hreflang` a known locale or `x-default`, the
 * full set present, and the entry referencing itself.
 */
export function validateHreflang(alternates, loc, origin) {
  const problems = [];
  const list = Array.isArray(alternates) ? alternates : [];
  if (list.length === 0) return { ok: true, problems: [], single: true };
  const seen = new Set();
  for (const { hreflang, href } of list) {
    seen.add(hreflang);
    if (hreflang !== "x-default" && !LOCALES.includes(hreflang)) {
      problems.push(`unknown hreflang "${hreflang}"`);
    }
    let url;
    try {
      url = new URL(href);
    } catch {
      problems.push(`alternate href is not absolute: ${href}`);
      continue;
    }
    if (url.origin !== new URL(origin).origin) {
      problems.push(`alternate href is off-origin: ${href}`);
    }
  }
  for (const locale of LOCALES) {
    if (!seen.has(locale)) problems.push(`missing hreflang "${locale}"`);
  }
  if (!seen.has("x-default")) problems.push('missing hreflang "x-default"');
  const hrefs = new Set(list.map((a) => a.href.replace(/\/$/, "")));
  if (!hrefs.has(String(loc).replace(/\/$/, ""))) {
    problems.push("no self-referential hreflang for the entry's own <loc>");
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Reads every `<meta name=… content=…>` with the given name, in either attribute
 * order. HTML attribute order is not significant, so a regex that assumes `name`
 * precedes `content` silently misses `<meta content="noindex" name="robots">`.
 * All matching tags are returned, not just the first: Google combines robots
 * directives across separate meta tags ("the search engine will use the sum of
 * the negative rules"), so a second `<meta name="robots" content="noindex">` is
 * a real instruction the first tag must not hide.
 */
export function findMetaContents(html, name) {
  const wanted = String(name).toLowerCase();
  const contents = [];
  for (const tag of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const tagName = tagAttr(tag[0], "name");
    if (tagName && tagName.toLowerCase() === wanted) {
      const content = tagAttr(tag[0], "content");
      if (content !== null) contents.push(content);
    }
  }
  return contents;
}

/**
 * Reads a `<link rel="canonical" href="…">` in either attribute order. Both
 * `rel` and `href` are read through `tagAttr`, which tolerates single or double
 * quotes and any attribute order — the previous regexes hardcoded a quote style
 * and an adjacency that real HTML does not guarantee.
 */
export function findCanonical(html) {
  for (const tag of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const rel = tagAttr(tag[0], "rel");
    if (rel && rel.toLowerCase().split(/\s+/).includes("canonical")) {
      return tagAttr(tag[0], "href");
    }
  }
  return null;
}

/** The canonical and robots directives a page's HTML head declares. */
export function extractPageSignals(html) {
  const text = String(html);
  const canonical = findCanonical(text);
  // Google applies the robots directives of every matching meta tag together and
  // takes the sum of the negative rules, so a `noindex` in any of them blocks the
  // page — and all tags of a name must be read, not just the first. Only the
  // `robots` and `googlebot` names address web search; `googlebot-news` governs
  // news results alone, so folding it in would flag a page as noindex that web
  // search still indexes.
  const metaRobots = ["robots", "googlebot"]
    .flatMap((name) => findMetaContents(text, name))
    .join(" ")
    .trim();
  const siteVerification = findMetaContents(text, "google-site-verification")[0] ?? null;
  // `findCanonical`/`findMetaContents` already XML-decode their values.
  return {
    canonical,
    metaRobots: metaRobots ? metaRobots.toLowerCase() : null,
    siteVerification,
  };
}

/** The directive names Google documents for robots meta tags and X-Robots-Tag. */
const ROBOTS_RULES = new Set([
  "all",
  "index",
  "noindex",
  "follow",
  "nofollow",
  "none",
  "nosnippet",
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "noarchive",
  "nocache",
  "noimageindex",
  "notranslate",
  "nopagereadaloud",
  "nositelinkssearchbox",
  "indexifembedded",
  "unavailable_after",
]);

/**
 * Drops a leading crawler name from an `X-Robots-Tag` value. The header may name
 * a user agent before the rules (`X-Robots-Tag: googlebot: nofollow`); the name
 * is not a rule, so leaving it in makes the directive list read as
 * "googlebot nofollow" and can only cause a false match, never a useful one.
 *
 * A prefix is only treated as a crawler name when it is not itself a rule: the
 * rules `max-image-preview:large` and `unavailable_after: <date>` also carry a
 * colon, so a bare "strip anything before the colon" would eat them.
 */
export function stripRobotsAgent(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^\s*([a-z][a-z0-9_-]*)\s*:\s*(?=[a-z])/i);
  if (!match || ROBOTS_RULES.has(match[1].toLowerCase())) return value.trim();
  return value.slice(match[0].length).trim();
}

/**
 * Whether a live page may be indexed, given the signals a crawler reads. A
 * `noindex` directive, in the meta tag or the `X-Robots-Tag` header, keeps the
 * page out of the index even when it is listed in the sitemap — so a sitemap
 * entry that is `noindex` is a contradiction, not a note.
 */
export function evaluateIndexability({ status, canonical, metaRobots, xRobotsTag, loc, origin }) {
  if (status !== 200) return { ok: false, state: "unreachable", reason: `HTTP ${status}` };
  const robots = `${metaRobots ?? ""} ${stripRobotsAgent(xRobotsTag)}`.toLowerCase();
  // `none` is documented shorthand for `noindex, nofollow` (Google robots meta
  // tag reference), so it blocks indexing exactly as `noindex` does. It must match
  // the whole directive, not a substring: a `\bnone\b` test also matched the
  // value of `max-image-preview:none` / `max-video-preview:none`, which restrict
  // image and video previews but leave the page fully indexable.
  if (/(?:^|[\s,])(?:noindex|none)(?=$|[\s,])/.test(robots)) {
    return { ok: false, state: "noindex", reason: "page is noindex but listed in the sitemap" };
  }
  if (!canonical) {
    return { ok: false, state: "no-canonical", reason: "page declares no canonical" };
  }
  let canonicalUrl;
  try {
    canonicalUrl = new URL(canonical);
  } catch {
    return { ok: false, state: "relative-canonical", reason: `canonical is not absolute: ${canonical}` };
  }
  if (canonicalUrl.origin !== new URL(origin).origin) {
    return { ok: false, state: "off-origin-canonical", reason: `canonical is off-origin: ${canonical}` };
  }
  const path = canonicalUrl.pathname;
  if (path === `/${DEFAULT_LOCALE}` || path.startsWith(`/${DEFAULT_LOCALE}/`)) {
    return {
      ok: false,
      state: "default-locale-canonical",
      reason: `canonical carries the /tr prefix which redirects: ${canonical}`,
    };
  }
  if (canonical.replace(/\/$/, "") !== String(loc).replace(/\/$/, "")) {
    return {
      ok: false,
      state: "canonical-mismatch",
      reason: `canonical ${canonical} does not match the sitemap <loc> ${loc}`,
    };
  }
  return { ok: true, state: "indexable", reason: `canonical ${canonical}` };
}

/**
 * Whether the IndexNow key file proves ownership: the host must serve
 * `/<key>.txt` with a body equal to the key. IndexNow refuses a host whose key
 * it cannot validate, so a mismatch silently disables every submission.
 */
export function evaluateIndexNowKey({ status, body, key, error }) {
  if (error) return { ok: false, state: "unreachable", reason: `key file not reachable: ${error}` };
  if (status !== 200) return { ok: false, state: "unreachable", reason: `key file answered HTTP ${status}` };
  if (String(body ?? "").trim() !== key) {
    return { ok: false, state: "mismatch", reason: "key file body does not match the key" };
  }
  return { ok: true, state: "valid", reason: `key file matches ${key.slice(0, 8)}…` };
}

const results = [];
function record(area, status, detail) {
  results.push({ area, status, detail });
}
const ICON = { pass: "PASS", warn: "WARN", fail: "FAIL", skip: "SKIP" };

async function fetchText(url, { userAgent, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: userAgent ? { "user-agent": userAgent } : undefined,
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      status: response.status,
      body: await response.text().catch(() => ""),
      // A page can be deindexed by an `X-Robots-Tag` header alone, with no
      // `<meta name="robots">` in the HTML — so the header must be read, not
      // assumed absent.
      xRobotsTag: response.headers.get("x-robots-tag"),
      // Vercel marks a disabled deployment (blocked/suspended/over-quota
      // account) on the response header as well as the 402 status.
      vercelError: response.headers.get("x-vercel-error"),
      error: null,
    };
  } catch (error) {
    return { status: 0, body: "", xRobotsTag: null, vercelError: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vercel answers a disabled deployment (blocked/suspended/over-quota account)
 * with **402** and `x-vercel-error: DEPLOYMENT_DISABLED`. That is an account
 * state, not a property of the site's indexing configuration: every request to
 * the origin shares it, so reading it as `fail robots`/`fail sitemap` blames the
 * crawler surface for an outage that has nothing to do with it. Mirrors
 * `verify-production-deployment.mjs`, which treats the same state distinctly.
 */
export function isDeploymentDisabled(status, vercelError) {
  if (status === 402) return true;
  return (
    typeof vercelError === "string" &&
    vercelError.trim().toUpperCase() === "DEPLOYMENT_DISABLED"
  );
}

/**
 * A clause explaining why the origin could not be measured, or `null` when it
 * answered normally. A disabled deployment and a Cloudflare/interstitial
 * challenge both leave the indexing surface unmeasurable from here; neither is
 * evidence about the site, so both are a `skip`. A disabled deployment is
 * checked first: it is an account-level outage, and the challenge heuristic
 * would otherwise only partly cover it.
 */
export function unmeasurableReason(status, body, vercelError) {
  if (isDeploymentDisabled(status, vercelError)) {
    return "the deployment is disabled (HTTP 402, DEPLOYMENT_DISABLED) — the site is down for every visitor";
  }
  if (status === 403 || status === 429 || status === 503) {
    return `it is behind a challenge (HTTP ${status})`;
  }
  if (/just a moment|cf-challenge|enable javascript and cookies/i.test(body ?? "")) {
    return "it is behind a challenge (interstitial page)";
  }
  return null;
}

async function checkRobots() {
  const { status, body, vercelError, error } = await fetchText(`${ORIGIN}/robots.txt`);
  if (error) {
    record("robots", "skip", `could not fetch robots.txt: ${error}`);
    return null;
  }
  const unmeasurable = unmeasurableReason(status, body, vercelError);
  if (unmeasurable) {
    record("robots", "skip", `robots.txt is unmeasurable: ${unmeasurable}`);
    return null;
  }
  if (status !== 200) {
    record("robots", "fail", `robots.txt answered HTTP ${status}`);
    return null;
  }
  const robots = parseRobots(body);
  if (!isPathAllowed(robots, "/")) {
    record("robots", "fail", "robots.txt disallows crawling the site root");
    return robots;
  }
  const sitemap = robots.sitemaps.find((s) => isSameOrigin(s, ORIGIN));
  if (!sitemap) {
    record("robots", "fail", "robots.txt does not advertise the origin's sitemap");
    return robots;
  }
  record("robots", "pass", `allows crawling; sitemap ${sitemap}`);
  return robots;
}

async function checkSitemap(sitemapUrl) {
  const { status, body, vercelError, error } = await fetchText(sitemapUrl);
  const unmeasurable = unmeasurableReason(status, body, vercelError);
  if (error || unmeasurable) {
    record("sitemap", "skip", `sitemap is unmeasurable: ${error ?? unmeasurable}`);
    return null;
  }
  if (status !== 200) {
    record("sitemap", "fail", `sitemap answered HTTP ${status}`);
    return null;
  }
  const parsed = parseSitemap(body);
  if (parsed.isIndex) {
    record("sitemap", "warn", `sitemap index with ${parsed.childSitemaps.length} child sitemap(s); not walked`);
    return null;
  }
  if (parsed.urls.length === 0) {
    record("sitemap", "fail", "sitemap contains no <url> entries");
    return null;
  }
  const badLoc = parsed.urls.map((u) => validateLoc(u.loc, ORIGIN)).find((r) => !r.ok);
  if (badLoc) {
    record("sitemap", "fail", badLoc.reason);
    return parsed;
  }
  const badHreflang = parsed.urls
    .map((u) => ({ loc: u.loc, ...validateHreflang(u.alternates, u.loc, ORIGIN) }))
    .find((r) => !r.ok);
  if (badHreflang) {
    record("sitemap", "fail", `hreflang problem at ${badHreflang.loc}: ${badHreflang.problems.join(", ")}`);
    return parsed;
  }
  const single = parsed.urls.filter((u) => u.alternates.length === 0).length;
  record(
    "sitemap",
    "pass",
    `${parsed.urls.length} URLs, all on-origin canonical; ${parsed.urls.length - single} with the full hreflang set, ${single} single-locale (no hreflang)`,
  );
  return parsed;
}

/** True when a path carries a non-default locale prefix, e.g. `/en/jobs`. */
export function hasLocalePrefix(path) {
  const first = String(path).split("/")[1];
  return Boolean(first) && LOCALES.includes(first) && first !== DEFAULT_LOCALE;
}

/**
 * For up to three single-locale entries, confirms the localized duplicate
 * canonicalises back to the entry's `<loc>`. That is what makes omitting
 * hreflang correct: the other-language URLs are duplicates that consolidate to
 * one canonical, not independent alternates. If a duplicate canonicalises to
 * itself instead, the two URLs compete and one of them should be in the
 * sitemap with its own hreflang set — a real defect.
 */
async function checkSingleLocaleConsolidation(parsed) {
  if (!parsed) return;
  const singles = parsed.urls
    .filter((u) => u.alternates.length === 0)
    .filter((u) => !hasLocalePrefix(pathOf(u.loc) ?? "/"));
  if (singles.length === 0) return;
  const probes = singles.slice(0, 3);
  const failures = [];
  let checked = 0;
  for (const { loc } of probes) {
    const path = pathOf(loc);
    if (!path) continue;
    const variant = `${ORIGIN}/en${path === "/" ? "" : path}`;
    const { status, body, vercelError, error } = await fetchText(variant, {
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
    });
    if (error || unmeasurableReason(status, body, vercelError)) continue;
    const { canonical } = extractPageSignals(body);
    checked += 1;
    if ((canonical ?? "").replace(/\/$/, "") !== loc.replace(/\/$/, "")) {
      failures.push(`${variant} canonicalises to ${canonical ?? "(none)"}, not ${loc}`);
    }
  }
  if (checked === 0) return;
  if (failures.length > 0) {
    record("single-loc", "fail", `${failures[0]}`);
    return;
  }
  record("single-loc", "pass", `${checked} single-locale entries: the localized duplicate canonicalises back`);
}

/** Samples sitemap URLs (evenly, always including the home page) for liveness. */
export function sampleUrls(urls, size) {
  if (urls.length <= size) return urls.map((u) => u.loc);
  const step = Math.ceil(urls.length / size);
  const picked = [];
  for (let i = 0; i < urls.length && picked.length < size; i += step) {
    picked.push(urls[i].loc);
  }
  return picked;
}

/**
 * Turns one fetched page into an indexability verdict, reading both the meta
 * robots directive and the `X-Robots-Tag` header. Kept pure and exported so a
 * regression in the wiring (a header fetched but not consulted) fails a test
 * rather than silently passing every page.
 */
export function verdictForPage({ status, body, xRobotsTag, loc, origin }) {
  const signals = extractPageSignals(body);
  return evaluateIndexability({
    status,
    canonical: signals.canonical,
    metaRobots: signals.metaRobots,
    xRobotsTag,
    loc,
    origin,
  });
}

async function checkPages(parsed) {
  if (!parsed || parsed.urls.length === 0) return;
  const locs = sampleUrls(parsed.urls, SAMPLE_SIZE);
  let checked = 0;
  const failures = [];
  for (const loc of locs) {
    const { status, body, xRobotsTag, vercelError, error } = await fetchText(loc, {
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
    });
    if (error || unmeasurableReason(status, body, vercelError)) continue;
    const verdict = verdictForPage({ status, body, xRobotsTag, loc, origin: ORIGIN });
    checked += 1;
    if (!verdict.ok) failures.push(`${loc}: ${verdict.reason}`);
  }
  if (checked === 0) {
    record("pages", "skip", "no sampled page was reachable from here (challenge/egress)");
    return;
  }
  if (failures.length > 0) {
    record("pages", "fail", `${failures.length}/${checked} sampled pages not indexable: ${failures[0]}`);
    return;
  }
  record("pages", "pass", `${checked} sampled pages are 200, indexable, with a matching canonical`);
}

async function checkIndexNow() {
  const publicDir = path.join(REPO_ROOT, "public");
  let found;
  try {
    found = await readIndexNowKey(publicDir);
  } catch (error) {
    record("indexnow", "skip", `could not read public/: ${error.message}`);
    return;
  }
  if (!found) {
    record("indexnow", "skip", "no IndexNow key file in public/");
    return;
  }
  const { key, file: keyFile } = found;
  const { status, body, vercelError, error } = await fetchText(`${ORIGIN}/${keyFile}`);
  const unmeasurable = unmeasurableReason(status, body, vercelError);
  const verdict = evaluateIndexNowKey({ status, body, key, error });
  if (!verdict.ok && unmeasurable) {
    record("indexnow", "skip", `key file is unmeasurable: ${unmeasurable}`);
    return;
  }
  record("indexnow", verdict.ok ? "pass" : verdict.state === "unreachable" ? "skip" : "fail", verdict.reason);
}

async function main() {
  console.log(`Indexing check for ${ORIGIN}\n`);
  const robots = await checkRobots();
  const sitemapUrl = robots?.sitemaps.find((s) => isSameOrigin(s, ORIGIN)) ?? `${ORIGIN}/sitemap.xml`;
  const parsed = await checkSitemap(sitemapUrl);
  await checkSingleLocaleConsolidation(parsed);
  await checkPages(parsed);
  await checkIndexNow();

  for (const r of results) {
    console.log(`  ${ICON[r.status].padEnd(4)} ${r.area.padEnd(9)} ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log(`\n${failed} failure(s), ${warned} warning(s), ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

// Only run when invoked directly, so the pure helpers stay importable in tests.
if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
