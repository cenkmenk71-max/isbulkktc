import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { getLocalePrefix } from "@/i18n/routing";
import { mergeLocaleIntoUserMetadata } from "@/features/identity/oauth-signup-intent";

import { messageForAuthErrorCode } from "@/features/identity/auth-errors";
import {
  audienceFromCallbackParam,
  parseAuthFlow,
  resolveAuthDestination,
  resolveAuthFailurePath,
} from "@/features/identity/auth-routing";

const templateDirectory = new URL("../../supabase/templates/", import.meta.url);

function readTemplate(name: string): string {
  return readFileSync(new URL(name, templateDirectory), "utf8");
}

const templateFiles = readdirSync(templateDirectory).filter((name) =>
  name.endsWith(".html"),
);

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

// ---------------------------------------------------------------------------
// A real renderer for the Go template subset the auth emails use.
//
// Supabase Auth renders these files with Go's `text/template`, so a JavaScript
// assertion on the raw source proves nothing about what a user receives. This
// evaluates the same constructs (assignments, `with`, `if`/`else if`/`else`,
// `and`/`or`/`eq`/`not`, field and variable references) against the same data
// shape GoTrue supplies. It is a test-only interpreter, not a mock: the input
// is the committed template and the output is the email body.
// ---------------------------------------------------------------------------

type Value = string | number | boolean | null | Record<string, unknown>;

type Token = { kind: "text"; value: string } | { kind: "action"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("{{", index);
    if (open === -1) {
      tokens.push({ kind: "text", value: source.slice(index) });
      break;
    }
    if (open > index) tokens.push({ kind: "text", value: source.slice(index, open) });

    const close = source.indexOf("}}", open + 2);
    if (close === -1) throw new Error("Unterminated template action");

    let body = source.slice(open + 2, close);
    let trimLeft = false;
    let trimRight = false;
    if (body.startsWith("-")) {
      body = body.slice(1);
      trimLeft = true;
    }
    if (body.endsWith("-")) {
      body = body.slice(0, -1);
      trimRight = true;
    }
    if (trimLeft && tokens.length > 0 && tokens[tokens.length - 1].kind === "text") {
      const last = tokens[tokens.length - 1] as { kind: "text"; value: string };
      last.value = last.value.replace(/\s+$/, "");
    }
    tokens.push({ kind: "action", value: body.trim() });
    index = close + 2;
    if (trimRight) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
    }
  }

  return tokens;
}

class Scope {
  // Go template variables are visible to nested blocks and assignments mutate
  // the declared variable, so children share the same map.
  private readonly variables: Map<string, Value>;

  constructor(
    public dot: Value,
    variables: Map<string, Value> = new Map(),
  ) {
    this.variables = variables;
  }

  set(name: string, value: Value): void {
    this.variables.set(name.replace(/^\$/, ""), value);
  }

  get(name: string): Value {
    const key = name.replace(/^\$/, "");
    if (!this.variables.has(key)) throw new Error(`Undefined variable ${name}`);
    return this.variables.get(key) as Value;
  }

  child(dot: Value): Scope {
    return new Scope(dot, this.variables);
  }
}

function fieldValue(dot: Value, path: string): Value {
  if (path === "" || path === ".") return dot;
  let current: unknown = dot;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return (current ?? null) as Value;
}

function truthy(value: Value): boolean {
  if (value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (typeof value === "boolean") return value;
  return Object.keys(value).length > 0;
}

/** WCAG 2.x relative-luminance contrast ratio between two `#rrggbb` colours. */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (colour: string): number => {
    const channels = [1, 3, 5].map((offset) => {
      const value = parseInt(colour.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** First `#rrggbb` in a CSS value, so `background: #fff url(...)` still resolves. */
function hexOf(value: string): string | null {
  return /#[0-9a-f]{6}\b/i.exec(value.toLowerCase())?.[0] ?? null;
}

function styleRules(html: string): Map<string, Record<string, string>> {
  const block = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  const rules = new Map<string, Record<string, string>>();

  for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      declarations[property] = declaration
        .slice(colon + 1)
        .replace(/!important/gi, "")
        .trim();
    }
    rules.set(selector.trim(), declarations);
  }

  return rules;
}

interface StyledNode {
  tag: string;
  classes: string[];
  ancestors: string[];
  parent: number;
  background: string | null;
  colour: string | null;
}

const voidTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

/**
 * Flattens the rendered markup into nodes that remember their ancestor classes,
 * which is enough to resolve the single-level descendant selectors the templates
 * use. The cascade is then applied by document order, so a parent's colour or
 * background is inherited exactly as a mail client would.
 */
function styledNodes(html: string): StyledNode[] {
  const rules = styleRules(html);
  const nodes: StyledNode[] = [];
  const open: number[] = [];
  const classRe = /class\s*=\s*"([^"]*)"/;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

  const ruleValue = (node: StyledNode, property: string): string | null => {
    let match: { depth: number; value: string } | null = null;
    for (const [selector, declarations] of rules) {
      const value = declarations[property];
      if (!value) continue;
      const parts = selector.split(/\s+/);
      const target = parts[parts.length - 1];
      if (!target.startsWith(".") || !node.classes.includes(target.slice(1))) continue;
      const required = parts.slice(0, -1).map((part) => part.replace(/^\./, ""));
      if (!required.every((name) => node.ancestors.includes(name))) continue;
      if (!match || parts.length >= match.depth) match = { depth: parts.length, value };
    }
    return match?.value ?? null;
  };

  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html))) {
    const [, closing, name, attributes] = tag;
    if (closing) {
      open.pop();
      continue;
    }

    const parent = open.length > 0 ? open[open.length - 1] : -1;
    const node: StyledNode = {
      tag: name.toLowerCase(),
      classes: (classRe.exec(attributes)?.[1] ?? "").split(/\s+/).filter(Boolean),
      ancestors: parent < 0 ? [] : [...nodes[parent].ancestors, ...nodes[parent].classes],
      parent,
      background: null,
      colour: null,
    };

    const inherited = parent < 0 ? null : nodes[parent];
    const declared =
      hexOf(ruleValue(node, "background-color") ?? "") ??
      hexOf(ruleValue(node, "background") ?? "");
    node.background = declared ?? inherited?.background ?? null;
    node.colour = hexOf(ruleValue(node, "color") ?? "") ?? inherited?.colour ?? null;

    nodes.push(node);
    if (!voidTags.has(node.tag)) open.push(nodes.length - 1);
  }

  return nodes;
}

const fixedArity: Record<string, number> = { eq: 2, ne: 2, not: 1 };
const variadic = new Set(["and", "or"]);

/** Splits an action body into expression tokens, keeping quoted strings whole. */
function expressionTokens(expression: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === '"') {
      current += character;
      index += 1;
      while (index < expression.length && expression[index] !== '"') {
        current += expression[index];
        index += 1;
      }
      if (index >= expression.length) throw new Error("Unterminated string literal");
      current += expression[index];
      continue;
    }
    if (character === "(" || character === ")") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      tokens.push(character);
      continue;
    }
    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseExpression(tokens: string[], cursor: { index: number }, scope: Scope): Value {
  if (cursor.index >= tokens.length) throw new Error("Unexpected end of expression");
  const token = tokens[cursor.index];
  cursor.index += 1;

  if (token === "(") {
    const value = parseExpression(tokens, cursor, scope);
    if (tokens[cursor.index] !== ")") throw new Error("Expected )");
    cursor.index += 1;
    return value;
  }
  if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
  if (token.startsWith("$")) return scope.get(token);
  if (token.startsWith(".")) return fieldValue(scope.dot, token.slice(1));
  if (/^-?\d+$/.test(token)) return Number(token);
  if (token === "true") return true;
  if (token === "false") return false;

  const args: Value[] = [];
  if (variadic.has(token)) {
    while (cursor.index < tokens.length && tokens[cursor.index] !== ")") {
      args.push(parseExpression(tokens, cursor, scope));
    }
  } else if (token in fixedArity) {
    for (let index = 0; index < fixedArity[token]; index += 1) {
      args.push(parseExpression(tokens, cursor, scope));
    }
  } else {
    throw new Error(`Unsupported function ${token}`);
  }

  if (token === "eq") return args[0] === args[1];
  if (token === "ne") return args[0] !== args[1];
  if (token === "not") return !truthy(args[0]);
  if (token === "and") return args.every(truthy);
  return args.some(truthy);
}

function evaluateExpression(expression: string, scope: Scope): Value {
  return parseExpression(expressionTokens(expression), { index: 0 }, scope);
}

type Node =
  | { kind: "text"; value: string }
  | { kind: "output"; expression: string }
  | { kind: "assign"; name: string; expression: string }
  | { kind: "if"; branches: { condition: string; body: Node[] }[]; fallback: Node[] }
  | { kind: "with"; expression: string; body: Node[]; fallback: Node[] };

function parseNodes(tokens: Token[], cursor: { index: number }, stopAt: Set<string>): Node[] {
  const nodes: Node[] = [];

  while (cursor.index < tokens.length) {
    const token = tokens[cursor.index];

    if (token.kind === "text") {
      cursor.index += 1;
      nodes.push({ kind: "text", value: token.value });
      continue;
    }

    const keyword = token.value.split(/\s+/)[0];
    if (stopAt.has(keyword)) return nodes;
    cursor.index += 1;

    if (keyword === "if" || keyword === "with") {
      const opener = token.value.replace(/^(if|with)\s+/, "");
      const branches: { condition: string; body: Node[] }[] = [];
      let fallback: Node[] = [];
      let condition: string | null = opener;

      for (;;) {
        const body = parseNodes(tokens, cursor, new Set(["else", "end"]));
        if (keyword === "with" && branches.length === 0) {
          branches.push({ condition: opener, body });
        } else if (condition !== null) {
          branches.push({ condition, body });
        } else {
          fallback = body;
        }

        const closer = tokens[cursor.index];
        if (!closer || closer.kind !== "action") throw new Error("Missing end");
        cursor.index += 1;
        const words = closer.value.split(/\s+/);

        if (words[0] === "end") break;
        if (words[1] === "if") {
          condition = closer.value.replace(/^else\s+if\s+/, "");
          continue;
        }
        condition = null;
      }

      if (keyword === "with") {
        nodes.push({
          kind: "with",
          expression: opener,
          body: branches[0].body,
          fallback,
        });
      } else {
        nodes.push({ kind: "if", branches, fallback });
      }
      continue;
    }

    const assignment = token.value.match(/^(\$[A-Za-z_][\w]*)\s*(?::=|=)\s*(.+)$/);
    if (assignment) {
      nodes.push({
        kind: "assign",
        name: assignment[1],
        expression: assignment[2],
      });
      continue;
    }

    nodes.push({ kind: "output", expression: token.value });
  }

  return nodes;
}

function evaluateNodes(nodes: Node[], scope: Scope): string {
  let output = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      output += node.value;
      continue;
    }
    if (node.kind === "assign") {
      scope.set(node.name, evaluateExpression(node.expression, scope));
      continue;
    }
    if (node.kind === "output") {
      const value = evaluateExpression(node.expression, scope);
      output += value === null ? "" : String(value);
      continue;
    }
    if (node.kind === "with") {
      const value = evaluateExpression(node.expression, scope);
      output += truthy(value)
        ? evaluateNodes(node.body, scope.child(value))
        : evaluateNodes(node.fallback, scope);
      continue;
    }

    let matched = false;
    for (const branch of node.branches) {
      if (truthy(evaluateExpression(branch.condition, scope))) {
        output += evaluateNodes(branch.body, scope);
        matched = true;
        break;
      }
    }
    if (!matched) output += evaluateNodes(node.fallback, scope);
  }

  return output;
}

function renderGoTemplate(source: string, data: Record<string, Value>): string {
  const tokens = tokenize(source);
  const nodes = parseNodes(tokens, { index: 0 }, new Set());
  return evaluateNodes(nodes, new Scope(data));
}

function renderFor(template: string, locale: string, overrides: Record<string, Value> = {}) {
  return renderGoTemplate(template, {
    Data: { locale },
    Email: "aday@example.com",
    NewEmail: "yeni@example.com",
    OldEmail: "eski@example.com",
    Token: "482913",
    TokenHash: "token-hash",
    SiteURL: "https://isbulkktc.com",
    RedirectTo: "https://isbulkktc.com/auth/callback",
    ConfirmationURL:
      "https://uwmhquvzbilbfzdrlxmb.supabase.co/auth/v1/verify?token=abc&type=email&redirect_to=https%3A%2F%2Fisbulkktc.com%2Fauth%2Fcallback",
    ...overrides,
  });
}

test("the auth email directory covers every GoTrue template the app can trigger", () => {
  assert.deepEqual(templateFiles.sort(), [
    "confirmation.html",
    "email_change.html",
    "invite.html",
    "magic_link.html",
    "password-changed.html",
    "reauthentication.html",
    "recovery.html",
  ]);
});

test("each template renders in all six locales without leftover actions", () => {
  for (const file of templateFiles) {
    const source = readTemplate(file);
    for (const locale of locales) {
      const html = renderFor(source, locale);
      assert.doesNotMatch(html, /\{\{|\}\}/, `${file} left a template action for ${locale}`);
      assert.match(html, new RegExp(`lang="${locale}"`), `${file} did not set lang=${locale}`);
      assert.match(
        html,
        new RegExp(`dir="${locale === "fa" ? "rtl" : "ltr"}"`),
        `${file} set the wrong text direction for ${locale}`,
      );
      assert.ok(html.includes("İşBul KKTC"), `${file} dropped the brand for ${locale}`);
    }
  }
});

test("templates fall back to Turkish when the profile locale is absent or unknown", () => {
  for (const file of templateFiles) {
    const source = readTemplate(file);
    for (const data of [{}, { locale: "" }, { locale: "xx" }, { locale: "he" }]) {
      const html = renderGoTemplate(source, {
        Data: data,
        Email: "a@b.co",
        NewEmail: "n@e.co",
        Token: "123456",
        SiteURL: "https://isbulkktc.com",
        ConfirmationURL: "https://isbulkktc.com/auth/callback",
      });
      assert.match(html, /lang="tr"/, `${file} did not fall back to Turkish for ${JSON.stringify(data)}`);
      assert.doesNotMatch(html, /\{\{/, `${file} left an action after fallback`);
    }
  }
});

test("localized copy is genuinely translated, not the Turkish string repeated", () => {
  const confirmation = readTemplate("confirmation.html");
  const titles = locales.map((locale) => {
    const match = renderFor(confirmation, locale).match(/<title>([^<]+)<\/title>/);
    assert.ok(match, `confirmation.html has no title for ${locale}`);
    return match[1];
  });
  assert.equal(new Set(titles).size, titles.length, "titles must differ per locale");
  assert.ok(titles.some((title) => /[\u0600-\u06FF]/.test(title)), "Persian copy is missing");
  assert.ok(titles.some((title) => /[\u0400-\u04FF]/.test(title)), "Russian copy is missing");
  assert.ok(titles.some((title) => /[\u0370-\u03FF]/.test(title)), "Greek copy is missing");
});

test("templates keep the GoTrue variables GoTrue substitutes", () => {
  const expectations: Record<string, string[]> = {
    "confirmation.html": [".Email", ".ConfirmationURL", ".SiteURL"],
    "recovery.html": [".Email", ".ConfirmationURL", ".SiteURL"],
    "invite.html": [".Email", ".ConfirmationURL", ".SiteURL"],
    "magic_link.html": [".Email", ".ConfirmationURL", ".SiteURL"],
    "email_change.html": [".NewEmail", ".ConfirmationURL", ".SiteURL"],
    "reauthentication.html": [".Token", ".SiteURL"],
    "password-changed.html": [".Email", ".SiteURL"],
  };

  for (const [file, variables] of Object.entries(expectations)) {
    const source = readTemplate(file);
    for (const variable of variables) {
      assert.ok(
        source.includes(`{{ ${variable} }}`),
        `${file} no longer uses {{ ${variable} }}`,
      );
    }
    const rendered = renderFor(source, "en");
    for (const variable of variables) {
      assert.ok(!rendered.includes(variable), `${file} leaked ${variable} into the output`);
    }
  }
});

test("every link in a rendered email is an absolute https URL", () => {
  for (const file of templateFiles) {
    for (const locale of locales) {
      const html = renderFor(readTemplate(file), locale);
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map(([, url]) => url);
      assert.ok(hrefs.length > 0, `${file} (${locale}) has no links`);
      for (const href of hrefs) {
        assert.match(
          href,
          /^https:\/\//,
          `${file} (${locale}) has a relative or insecure link: ${href}`,
        );
      }
    }
  }
});

test("rendered emails contain no scripting or event handlers", () => {
  for (const file of templateFiles) {
    const html = renderFor(readTemplate(file), "en");
    assert.doesNotMatch(html, /<script/i, `${file} ships a script tag`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} ships an inline event handler`);
    assert.doesNotMatch(html, /javascript:/i, `${file} ships a javascript: URL`);
    assert.doesNotMatch(html, /<iframe/i, `${file} ships an iframe`);
  }
});

test("the layout is accessible: language, direction, table role and a heading", () => {
  for (const file of templateFiles) {
    for (const locale of locales) {
      const html = renderFor(readTemplate(file), locale);
      assert.match(html, /<html lang="[a-z]{2}" dir="(ltr|rtl)">/, `${file} has no lang/dir`);
      assert.match(html, /role="presentation"/, `${file} has no presentational table role`);
      assert.match(html, /<h1[ >]/, `${file} has no level-one heading`);
      assert.match(html, /<h2[ >]/, `${file} has no level-two heading`);
      assert.match(
        html,
        /<meta name="viewport"/,
        `${file} has no viewport meta tag`,
      );
    }
  }
});

test("the verification-code email labels the code for screen readers", () => {
  const html = renderFor(readTemplate("reauthentication.html"), "de");
  assert.match(html, /class="code-label"/);
  assert.match(html, /482913/);
  assert.doesNotMatch(html, /\{\{\s*\.Token\s*\}\}/);
});

test("every template shares one stylesheet", () => {
  const stylesheets = new Map<string, string>();
  for (const name of readdirSync(templateDirectory)) {
    const html = readTemplate(name);
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
    assert.ok(style, `${name} has no <style> block`);
    stylesheets.set(
      name,
      style
        .split("\n")
        .map((line) => line.trim())
        .join("\n"),
    );
  }

  const [first, ...rest] = [...stylesheets];
  for (const [name, style] of rest) {
    assert.equal(
      style,
      first[1],
      `${name} has drifted from ${first[0]}; keep one stylesheet so the palette and ` +
        "the contrast floors stay true for every email",
    );
  }
});

test("every text node in a rendered email clears the WCAG contrast floor", () => {
  // 3.0 for the 22px header and the 14px semibold button (large text), the 4.5
  // floor for everything else. Measuring the rendered tree means the assertion
  // tracks the template's own stylesheet instead of a copy of the palette.
  const large = new Set(["h1", "button"]);

  for (const name of readdirSync(templateDirectory)) {
    const html = renderFor(readTemplate(name), "en");
    const nodes = styledNodes(html);

    const textNodes = nodes.filter(
      (node) =>
        !["style", "title", "script", "head", "meta", "link"].includes(node.tag) &&
        node.colour &&
        node.background,
    );
    assert.ok(textNodes.length > 0, `${name} produced no measurable text nodes`);

    for (const node of textNodes) {
      const floor = large.has(node.tag) ? 3.0 : 4.5;
      const ratio = contrastRatio(node.colour!, node.background!);
      assert.ok(
        ratio >= floor,
        `${name}: <${node.tag} class="${node.classes.join(" ")}"> has ${node.colour} on ` +
          `${node.background} = ${ratio.toFixed(2)}, below the ${floor} floor`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Auth routing / error mapping
// ---------------------------------------------------------------------------

test("auth error codes keep email_not_confirmed distinct from the generic failure", () => {
  assert.equal(messageForAuthErrorCode("email_not_confirmed", "signInFailed"), "emailNotConfirmed");
  assert.equal(messageForAuthErrorCode("captcha_failed", "signInFailed"), "captchaFailed");
  assert.equal(messageForAuthErrorCode("invalid_credentials", "signInFailed"), "signInFailed");
  assert.equal(messageForAuthErrorCode(undefined, "signInFailed"), "signInFailed");
  assert.equal(messageForAuthErrorCode("", "signInFailed"), "signInFailed");
  assert.equal(messageForAuthErrorCode("email_not_confirmed", "signUpFailed"), "emailNotConfirmed");
});

test("the callback only accepts the documented audience and flow vocabulary", () => {
  assert.equal(audienceFromCallbackParam("company"), "employer");
  assert.equal(audienceFromCallbackParam("candidate"), "candidate");
  assert.equal(audienceFromCallbackParam("Employer"), "candidate");
  assert.equal(audienceFromCallbackParam(null), "candidate");
  assert.equal(audienceFromCallbackParam("//evil.example"), "candidate");

  assert.equal(parseAuthFlow("oauth"), "oauth");
  assert.equal(parseAuthFlow("reset"), "reset");
  assert.equal(parseAuthFlow(null), "email");
  assert.equal(parseAuthFlow("../../etc"), "email");
});

test("auth destinations and failure paths are locale-prefixed and never absolute", () => {
  assert.equal(resolveAuthDestination("candidate", "tr"), "/profile/dashboard");
  assert.equal(resolveAuthDestination("employer", "de"), "/de/company/dashboard");
  assert.equal(resolveAuthDestination("candidate", "fa"), "/fa/profile/dashboard");

  assert.equal(resolveAuthFailurePath("reset", "tr", "candidate"), "/forgot-password?error=expired");
  assert.equal(
    resolveAuthFailurePath("email", "ru", "employer"),
    "/ru/login?error=verification&audience=employer",
  );
  assert.equal(
    resolveAuthFailurePath("oauth", "en", "candidate"),
    "/en/login?error=oauth&audience=candidate",
  );

  for (const locale of locales) {
    for (const flow of ["email", "oauth", "reset"] as const) {
      for (const audience of ["candidate", "employer"] as const) {
        const path = resolveAuthFailurePath(flow, locale, audience);
        assert.match(path, /^\//, `${path} must be a root-relative path`);
        assert.doesNotMatch(path, /\/\//, `${path} must not become protocol-relative`);
      }
    }
  }
});

test("locale prefixes match the next-intl as-needed policy", () => {
  assert.equal(getLocalePrefix("tr"), "");
  for (const locale of ["en", "ru", "el", "fa", "de"] as const) {
    assert.equal(getLocalePrefix(locale), `/${locale}`);
  }
});

test("an OAuth account keeps the provider claims while gaining the locale", () => {
  // The email templates read `.Data.locale` and cannot reach `profiles`, so an
  // OAuth account that never had this written would be mailed in Turkish.
  const merged = mergeLocaleIntoUserMetadata(
    { avatar_url: "https://lh3.googleusercontent.com/a/x", full_name: "Ayşe" },
    "fa",
  );

  assert.equal(merged.locale, "fa");
  assert.equal(merged.avatar_url, "https://lh3.googleusercontent.com/a/x");
  assert.equal(merged.full_name, "Ayşe");

  // A fresh OAuth account has no metadata yet; the merge must still work.
  assert.deepEqual(mergeLocaleIntoUserMetadata(null, "de"), { locale: "de" });
  assert.deepEqual(mergeLocaleIntoUserMetadata(undefined, "ru"), { locale: "ru" });

  // An existing (possibly wrong) locale is replaced, not preserved.
  assert.equal(mergeLocaleIntoUserMetadata({ locale: "tr" }, "el").locale, "el");
});

// ---------------------------------------------------------------------------
// config.toml wiring
//
// A template section name is a free TOML key, so a typo (`recovry`) parses
// without error and GoTrue silently keeps its built-in template. Assert every
// configured name against the GoTrue vocabulary and that every content_path
// resolves to a file in this repository.
// ---------------------------------------------------------------------------

const gotrueTemplateNames = [
  "confirmation",
  "recovery",
  "invite",
  "magic_link",
  "email_change",
  "reauthentication",
];

const gotrueNotificationNames = ["password_changed"];

function readConfig(): string {
  return readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
}

function sectionNames(config: string, prefix: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\[${escaped}([^\\]]+)\\]$`, "gm");
  return [...config.matchAll(pattern)].map(([, name]) => name);
}

test("config.toml only names real GoTrue templates", () => {
  const config = readConfig();
  const templates = sectionNames(config, "auth.email.template.");
  assert.ok(templates.length > 0, "no auth.email.template sections found");

  for (const name of templates) {
    assert.ok(
      gotrueTemplateNames.includes(name),
      `auth.email.template.${name} is not a GoTrue template name`,
    );
  }

  for (const name of sectionNames(config, "auth.email.notification.")) {
    assert.ok(
      gotrueNotificationNames.includes(name),
      `auth.email.notification.${name} is not a GoTrue notification name`,
    );
  }
});

test("every configured template and notification points at a committed file", () => {
  const config = readConfig();
  const contentPaths = [...config.matchAll(/^content_path\s*=\s*"([^"]+)"$/gm)].map(
    ([, path]) => path,
  );
  assert.ok(contentPaths.length > 0, "no content_path entries found");

  const repositoryRoot = new URL("../../", import.meta.url);
  for (const contentPath of contentPaths) {
    const relative = contentPath.replace(/^\.\//, "");
    assert.ok(
      existsSync(new URL(relative, repositoryRoot)),
      `content_path ${contentPath} does not exist`,
    );
  }
});

test("the templates the app relies on are all wired in config.toml", () => {
  const config = readConfig();
  const wired = new Set(sectionNames(config, "auth.email.template."));
  // confirmation drives sign-up, recovery the reset flow, reauthentication the
  // MFA step; the rest ship so the hosted project can adopt them without edits.
  for (const name of gotrueTemplateNames) {
    assert.ok(wired.has(name), `auth.email.template.${name} is missing from config.toml`);
  }
});
