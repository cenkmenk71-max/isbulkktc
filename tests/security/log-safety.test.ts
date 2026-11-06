import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

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
 * expressions in any `console.*` call, 1 non-literal first argument — the
 * sanctioned `EMAIL_HEALTH_EVENT`). The gate keeps it clean.
 */

const ROOTS = ["src", "supabase/functions"];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = `${directory}/${entry}`;
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) files.push(path);
  }
  return files;
}

const sourceFiles = ROOTS.flatMap((root) => walk(root));

/** The argument text of every `console.<method>(…)` call, parens balanced. */
function consoleArguments(code: string): string[] {
  const callPattern = /console\s*\.\s*(?:log|error|warn|info|debug|trace)\s*\(/g;
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
  /process\.env\.[A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL)|formData\.get\(\s*["']password["']|\.(?:access|refresh|provider)_token\b|\bapi[_-]?key\b|\bservice[_-]?role\b/i;

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
  for (const file of sourceFiles) {
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
      const form = CREDENTIAL_VALUE_FORM.exec(args);
      const word = CREDENTIAL_WORD.exec(stripStringLiterals(args));
      if (form) offenders.push(`${file}: ${form[0]}`);
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

test("the credential-expression rule catches the real leak shapes (self-test)", () => {
  // The shapes this gate exists for — a password, an env secret, a bearer token.
  assert.equal(CREDENTIAL_VALUE_FORM.test('{ password: formData.get("password") }'), true);
  assert.equal(CREDENTIAL_VALUE_FORM.test("process.env.PUSH_CRON_SECRET"), true);
  assert.equal(CREDENTIAL_VALUE_FORM.test("session.access_token"), true);
  // The safe shapes already in the codebase must stay green.
  assert.equal(CREDENTIAL_VALUE_FORM.test("{ code: error.code }"), false);
  assert.equal(CREDENTIAL_VALUE_FORM.test('{ event: "resend_key_malformed" }'), false);
  assert.equal(CREDENTIAL_VALUE_FORM.test("{ userId }"), false);

  // The bare-value rule: a label mentioning the word is fine, a value is not.
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals('"Supabase password update failed.", { code }')), false);
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals("{ email, password }")), true);
  assert.equal(CREDENTIAL_WORD.test(stripStringLiterals('"sign-in failed", { email, token }')), true);
});
