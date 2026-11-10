import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { envReadNames } from "./env-access";

/**
 * Log safety — no password, token or key may reach a log line (#418 §7,
 * "Log: şifre/token loglanmıyor").
 *
 * Every other account-security property in that issue has a gate: cookie flags
 * (`session-cookie-flags`, `locale-cookie-flags`), auth ordering
 * (`cron-route-auth`, `notification-worker-auth`), the response surface
 * (`api-response-surface`). The log rule had none, so a `console.error("login
 * failed", { password })` — the single most common way a credential ends up in
 * a log aggregator — would ship with every gate green.
 *
 * Two rules, both source-text (the call sites are spread across 30+ files and
 * are not importable in isolation):
 *
 *   1. the first argument is a string/template literal, or a shared event name
 *      (a SCREAMING_SNAKE identifier). A bare object/`Error` first argument is
 *      what lets an SDK's error carry the request body into the log.
 *   2. the argument list mentions no credential-bearing expression.
 *
 * This is a **ratchet**: the codebase is clean today (measured: 0 credential
 * expressions in any `console.*` call across `src`, `supabase/functions` and
 * `scripts`, 1 non-literal first argument — the sanctioned `EMAIL_HEALTH_EVENT`).
 * The gate keeps it clean. The call scanner recognises every spelling a console
 * call can take — dot, bracket (`console["error"]`), optional chain
 * (`console?.error`) and an object alias (`const c = console`) — because a
 * matcher narrower than the language lets a credential-bearing call through with
 * the file still green.
 */

const ROOTS = ["src", "supabase/functions", "scripts"];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = `${directory}/${entry}`;
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|mjs)$/.test(entry) && !/\.test\./.test(entry)) files.push(path);
  }
  return files;
}

const sourceFiles = ROOTS.flatMap((root) => walk(root));

/**
 * Rule 1 is not enforced on `scripts/`: those CLI tools deliberately print a
 * `error.message` or a `JSON.stringify(findings)` first, which is a diagnostic,
 * not a credential. Rule 2 (below) *is* enforced there — the scripts run in CI
 * with `GH_TOKEN`, `VERCEL_TOKEN` and `SUPABASE_ACCESS_TOKEN`, so a leaked token
 * is the credential at risk, and the argument scan reads it.
 */
const literalFirstArgumentFiles = sourceFiles.filter((file) => !file.startsWith("scripts/"));

/** Every console method name the scanner recognises. */
const CONSOLE_METHODS = "log|error|warn|info|debug|trace";

/**
 * Identifiers bound to the console object (`const c = console`), so a call made
 * through the alias is scanned too. `const log = console.log` binds the *method*,
 * not the object, and is deliberately not an alias: a bare `log(…)` call cannot
 * be told apart from an unrelated function of the same name.
 */
function consoleReceiverAliases(code: string): string[] {
  const aliases: string[] = [];
  for (const match of code.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:globalThis\.|window\.)?console\s*(?![\w$.])/g,
  )) {
    aliases.push(match[1]!);
  }
  return aliases;
}

/**
 * The argument text of every `console.<method>(…)` call, parens balanced.
 *
 * The matcher must see every spelling a console call can take, or the rule is
 * only as wide as the narrowest one: a `console["error"](…)`, a
 * `console?.error(…)` or a call through an alias (`const c = console; c.error(…)`)
 * — all valid JavaScript — hid their argument from *both* rules while the file
 * stayed green. This is the same false-negative class the sibling detectors were
 * hardened against (`client-boundary`'s env reader, `sql-hardening`'s
 * table/body/grant patterns): a guard whose matcher is too narrow guards a
 * boundary with holes. A method destructured off the object
 * (`const { error } = console`) is not covered — matching a bare `error(…)` call
 * would flag every unrelated function of that name — and no such code exists.
 */
function consoleArguments(code: string): string[] {
  const receivers = ["console", ...consoleReceiverAliases(code)]
    .map((name) => name.replace(/\$/g, "\\$"))
    .join("|");
  const callPattern = new RegExp(
    `\\b(?:${receivers})\\s*(?:\\.\\s*(?:${CONSOLE_METHODS})|\\?\\.\\s*(?:${CONSOLE_METHODS})|\\[\\s*["'\`](?:${CONSOLE_METHODS})["'\`]\\s*\\])\\s*(?:\\?\\.\\s*)?\\(`,
    "g",
  );
  const args: string[] = [];
  for (const match of code.matchAll(callPattern)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (index < code.length && depth > 0) {
      const char = code[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      else if (char === '"' || char === "'" || char === "`") {
        // Skip the literal so a `)` or `,` inside it cannot unbalance the scan.
        index += 1;
        while (index < code.length && code[index] !== char) {
          if (code[index] === "\\") index += 1;
          index += 1;
        }
      }
      index += 1;
    }
    args.push(code.slice(start, index - 1));
  }
  return args;
}

/** The text up to the first top-level comma — the call's first argument. */
function firstArgument(argumentsText: string): string {
  let depth = 0;
  for (let index = 0; index < argumentsText.length; index += 1) {
    const char = argumentsText[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) return argumentsText.slice(0, index).trim();
    else if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < argumentsText.length && argumentsText[index] !== char) {
        if (argumentsText[index] === "\\") index += 1;
        index += 1;
      }
    }
  }
  return argumentsText.trim();
}

/**
 * A first argument that is safe to log: a string/template literal, or a shared
 * event name (SCREAMING_SNAKE by convention — `EMAIL_HEALTH_EVENT` is the only
 * one today). A bare object or `Error` is not: it is the shape that drags an
 * SDK error body into the log.
 */
function isLoggableFirstArgument(argument: string): boolean {
  return /^["'`]/.test(argument) || /^[A-Z][A-Z0-9_]*$/.test(argument);
}

/** A credential-bearing expression that must never appear in a log argument. */
const CREDENTIAL_VALUE_FORM =
  /formData\.get\(\s*["']password["']|\.(?:access|refresh|provider)_token\b|\bapi[_-]?key\b|\bservice[_-]?role\b/i;

/**
 * The non-public, credential-shaped env name an argument reads, if any — a name
 * ending in SECRET/TOKEN/KEY/PASSWORD/PASSWD/CREDENTIAL, through **any** access
 * form. The earlier inline regex matched only `process.env.NAME`, so a log that
 * shipped `process.env["RESEND_API_KEY"]` (or a destructured read) was invisible
 * to the gate. `env-access.ts` is the shared, self-tested reader for all forms.
 */
function credentialEnvName(args: string): string | undefined {
  return envReadNames(args).find(
    (name) =>
      !name.startsWith("NEXT_PUBLIC_") &&
      /(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL)$/.test(name),
  );
}

/**
 * A bare credential identifier used as a value. Tested against the argument
 * text with string literals removed, so a *label* that merely contains the word
 * (`"Supabase password reset request failed."`) is not a finding — only a value
 * (`{ email, password }`) is.
 */
const CREDENTIAL_WORD = /\b(?:password|passwd|secret|token|credential|authorization)\b/i;

/** Replace the contents of every string/template literal with a space. */
function stripStringLiterals(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < text.length && text[index] !== char) {
        if (text[index] === "\\") index += 1;
        index += 1;
      }
      out += " ";
    } else {
      out += char;
    }
  }
  return out;
}

test("every console call logs a label, not a raw object", () => {
  const offenders: string[] = [];
  for (const file of literalFirstArgumentFiles) {
    for (const args of consoleArguments(readFileSync(file, "utf8"))) {
      const first = firstArgument(args);
      if (!isLoggableFirstArgument(first)) offenders.push(`${file}: ${first.slice(0, 80)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a console call logs a raw value as its first argument — an SDK error body can ` +
      `carry a credential into the log; pass a label string:\n${offenders.join("\n")}`,
  );
});

test("no console call mentions a credential-bearing expression", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    for (const args of consoleArguments(readFileSync(file, "utf8"))) {
      const env = credentialEnvName(args);
      const form = CREDENTIAL_VALUE_FORM.exec(args);
      const word = CREDENTIAL_WORD.exec(stripStringLiterals(args));
      if (env) offenders.push(`${file}: ${env}`);
      else if (form) offenders.push(`${file}: ${form[0]}`);
      else if (word) offenders.push(`${file}: ${word[0]} (bare value)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a console call logs a credential-bearing expression (#418 §7):\n${offenders.join("\n")}`,
  );
});

test("the console-call scanner sees a nested call (self-test)", () => {
  // Guards the guard: the extractor must not stop at the first `)`, or a nested
  // call would hide its own argument from both rules.
  const code = 'console.error("outer", { code: error.code, inner: fn(")") });';
  const args = consoleArguments(code);
  assert.equal(args.length, 1);
  assert.equal(firstArgument(args[0]), '"outer"');
  assert.match(args[0], /error\.code/);
});

test("the first-argument rule accepts a label and rejects a raw object (self-test)", () => {
  assert.equal(isLoggableFirstArgument('"sign-in failed"'), true);
  assert.equal(isLoggableFirstArgument("`sign-in failed`"), true);
  assert.equal(isLoggableFirstArgument("EMAIL_HEALTH_EVENT"), true);
  assert.equal(isLoggableFirstArgument("{ email, password }"), false);
  assert.equal(isLoggableFirstArgument("error"), false);
  assert.equal(isLoggableFirstArgument("await response.text()"), false);
});

test("the scan covers scripts/ for the credential rule but not the label rule (self-test)", () => {
  // Rule 2 (the credential scan) must reach the CI scripts — they hold the
  // tokens. Rule 1 (the label rule) deliberately does not: those tools print a
  // diagnostic first argument. A regression that dropped `scripts` from ROOTS
  // would silently un-guard the deploy scripts.
  assert.ok(
    sourceFiles.some((file) => file.startsWith("scripts/")),
    "the credential scan must include scripts/",
  );
  assert.ok(
    literalFirstArgumentFiles.every((file) => !file.startsWith("scripts/")),
    "the label rule must not run on scripts/",
  );
  assert.ok(
    literalFirstArgumentFiles.length > 0,
    "the label rule must still cover src/ and supabase/functions/",
  );
});

test("the console-call scanner sees every console spelling (self-test)", () => {
  // Guards the guard: a matcher that only knows `console.error(` leaves a
  // credential visible to neither rule when the call is written any other way.
  // Every spelling below is valid JavaScript and every one reaches the log.
  const spellings = [
    'console.error("x", { password })',
    'console["error"]("x", { password })',
    "console['warn']('x', { token })",
    'console?.error("x", { password })',
    "console?.log(`x`, { secret })",
    'const c = console; c.error("x", { password })',
  ];
  for (const code of spellings) {
    const args = consoleArguments(code);
    assert.equal(args.length, 1, `scanner missed: ${code}`);
    assert.match(args[0]!, /password|token|secret/, `argument not captured: ${code}`);
  }
  // An aliased method binding is not an object alias, so a bare `log(…)` of an
  // unrelated function is not mistaken for a console call.
  assert.deepEqual(consoleArguments("const log = console.log; log('plain')"), []);
  // A plain `console.table` is not one of the recognised methods.
  assert.deepEqual(consoleArguments("console.table(rows)"), []);
});

test("the credential-expression rule catches the real leak shapes (self-test)", () => {
  // The shapes this gate exists for — a password, a bearer token.
  assert.equal(CREDENTIAL_VALUE_FORM.test('{ password: formData.get("password") }'), true);
  assert.equal(CREDENTIAL_VALUE_FORM.test("session.access_token"), true);
  // The safe shapes already in the codebase must stay green.
  assert.equal(CREDENTIAL_VALUE_FORM.test("{ code: error.code }"), false);
  assert.equal(CREDENTIAL_VALUE_FORM.test('{ event: "resend_key_malformed" }'), false);
  assert.equal(CREDENTIAL_VALUE_FORM.test("{ userId }"), false);

  // An env secret is caught through every access form, not just dot access — a
  // dot-only reader let `process.env["RESEND_API_KEY"]` reach a log green.
  assert.equal(credentialEnvName("process.env.PUSH_CRON_SECRET"), "PUSH_CRON_SECRET");
  assert.equal(credentialEnvName('process.env["RESEND_API_KEY"]'), "RESEND_API_KEY");
  assert.equal(
    credentialEnvName("process.env?.SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  assert.equal(credentialEnvName("const { VAPID_PRIVATE_KEY } = process.env"), "VAPID_PRIVATE_KEY");
  // A public variable and a non-credential name are not findings.
  assert.equal(credentialEnvName("process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID"), undefined);
  assert.equal(credentialEnvName("process.env.NODE_ENV"), undefined);

  // The bare-value rule: a label mentioning the word is fine, a value is not.
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals('"Supabase password update failed.", { code }')), false);
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals("{ email, password }")), true);
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals('"sign-in failed", { email, token }')), true);
});
