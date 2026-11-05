import assert from "node:assert/strict";
import test from "node:test";

/**
 * The response-header security controls in `next.config.ts`.
 *
 * `next.config.ts` is the only place this app sets CSP, HSTS, `X-Frame-Options`
 * and the rest of the header set, and it is not owned by any lane's test layer —
 * so nothing pinned it. A refactor that dropped a header, widened the CSP
 * `script-src`, or re-enabled `X-Powered-By` would ship with every gate green.
 *
 * These tests **import and evaluate the real config** rather than grepping the
 * source, so they assert the headers the server will actually send, not that a
 * string appears in a file. `headers()` is called the way Next.js calls it, and
 * the two groups (the global set and the Vercel-alias noindex rule) are read
 * from the result.
 */

type Header = { key: string; value: string };
type HeaderGroup = { source: string; has?: { type: string; value: string }[]; headers: Header[] };

async function loadConfig(): Promise<{
  headers: () => Promise<HeaderGroup[]>;
  poweredByHeader: boolean;
}> {
  const mod = await import(new URL("../../next.config.ts", import.meta.url).href);
  return mod.default;
}

const config = await loadConfig();
const groups = await config.headers();

/** The global header group: `source: "/(.*)"` with no `has` matcher. */
const globalGroup = groups.find((group) => group.source === "/(.*)" && !group.has);
assert.ok(globalGroup, "the global header group (source '/(.*)', no `has`) is missing");

const headerValue = (key: string): string | undefined =>
  globalGroup!.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;

test("the global group sends the full defensive header set", () => {
  const required: Record<string, RegExp> = {
    "x-content-type-options": /^nosniff$/i,
    "x-frame-options": /^(sameorigin|deny)$/i,
    "referrer-policy": /strict-origin-when-cross-origin/i,
    "strict-transport-security": /max-age=\d{6,}/i,
    "content-security-policy": /default-src/i,
    "cross-origin-opener-policy": /^same-origin$/i,
    "cross-origin-resource-policy": /^same-origin$/i,
    "x-permitted-cross-domain-policies": /^none$/i,
    "permissions-policy": /camera=\(\)/i,
  };

  const missing: string[] = [];
  for (const [key, pattern] of Object.entries(required)) {
    const value = headerValue(key);
    if (value === undefined) missing.push(`${key} (absent)`);
    else if (!pattern.test(value)) missing.push(`${key} = ${JSON.stringify(value)}`);
  }
  assert.deepEqual(missing, [], `header controls that regressed: ${missing.join("; ")}`);
});

test("the CSP locks down the high-value directives", () => {
  const csp = headerValue("content-security-policy");
  assert.ok(csp, "Content-Security-Policy is missing");

  // Valued directives: the directive name followed by a source list.
  const valuedDirectives: Record<string, RegExp> = {
    "default-src": /'self'/,
    "base-uri": /'self'/,
    "object-src": /'none'/,
    "frame-ancestors": /'self'/,
    "form-action": /'self'/,
  };
  // Valueless directives: presence alone is the control.
  const bareDirectives = ["upgrade-insecure-requests"];

  const failures: string[] = [];
  for (const [directive, pattern] of Object.entries(valuedDirectives)) {
    const found = new RegExp(`(?:^|;\\s*)${directive}\\s+([^;]*)`).exec(csp);
    if (!found) failures.push(`${directive} (absent)`);
    else if (!pattern.test(found[1])) failures.push(`${directive} ${JSON.stringify(found[1].trim())}`);
  }
  for (const directive of bareDirectives) {
    if (!new RegExp(`(?:^|;\\s*)${directive}(?:\\s*;|\\s*$)`).test(csp)) {
      failures.push(`${directive} (absent)`);
    }
  }
  assert.deepEqual(failures, [], `CSP directives that regressed: ${failures.join("; ")}`);
});

test("the CSP script-src does not allow a wildcard or a bare scheme", () => {
  const csp = headerValue("content-security-policy")!;
  const scriptSrc = /(?:^|;\s*)script-src\s+([^;]*)/.exec(csp)?.[1] ?? "";
  assert.ok(scriptSrc.length > 0, "script-src is absent from the CSP");
  // A bare `*` or `https:` would let any origin run script; only explicit hosts
  // and the two inline tokens this app needs are acceptable.
  assert.ok(!/(^|\s)\*(\s|$)/.test(scriptSrc), `script-src allows any host: ${scriptSrc}`);
  assert.ok(!/(^|\s)https:(\s|$)/.test(scriptSrc), `script-src allows any https host: ${scriptSrc}`);
  assert.ok(!/'unsafe-eval'/.test(scriptSrc), `script-src allows unsafe-eval: ${scriptSrc}`);
});

test("the framework does not advertise itself", () => {
  assert.equal(
    config.poweredByHeader,
    false,
    "poweredByHeader must stay false so X-Powered-By is not sent",
  );
});

test("the Vercel alias group keeps the app out of search indexes", () => {
  const aliasGroup = groups.find((group) =>
    group.has?.some((matcher) => matcher.type === "host" && matcher.value.includes("vercel")),
  );
  assert.ok(aliasGroup, "the Vercel-alias host group is missing");
  const robots = aliasGroup!.headers.find((header) => header.key.toLowerCase() === "x-robots-tag");
  assert.ok(robots, "the Vercel-alias group no longer sets X-Robots-Tag");
  assert.match(robots!.value, /noindex/i, "the alias must be noindex");
  assert.match(robots!.value, /nofollow/i, "the alias must be nofollow");
});
