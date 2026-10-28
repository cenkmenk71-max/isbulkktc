import { readdirSync, readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

/**
 * Maps a React component name to the source location that declares it.
 *
 * React 19 no longer populates `fiber._debugSource`, and Turbopack leaves
 * `_debugStack` empty, so the browser cannot report where a component lives.
 * The inspector overlay sends the component name it read off the fiber and
 * this module answers with the declaring file and line.
 */

export type ComponentLocation = {
  name: string;
  file: string;
  line: number;
  column: number;
  kind: "function" | "class" | "const" | "default";
};

export type ComponentIndex = {
  generatedAt: number;
  rootDir: string;
  components: Record<string, ComponentLocation[]>;
  /**
   * Literal `id` / `className` values found in JSX, keyed `id:<value>` or
   * `class:<token>`. React Server Components leave no trace in the browser —
   * they are not in the fiber tree, carry no `_debugOwner`, and the flight
   * payload omits source positions — so matching the rendered DOM back to the
   * markup that produced it is the only way to locate them.
   */
  domHints: Record<string, ComponentLocation[]>;
};

const SOURCE_DIRS = ["src"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git"]);

function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];

  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) {
        continue;
      }
      files.push(join(dir, entry.name));
    }
  };

  for (const dir of SOURCE_DIRS) {
    walk(join(rootDir, dir));
  }
  return files;
}

type Declaration = {
  name: string;
  kind: ComponentLocation["kind"];
  node: ts.Node;
};

/**
 * Finds component declarations in a single module.
 *
 * A component is a capitalized function declaration, a capitalized
 * arrow/function expression bound to a `const`, an exported default function,
 * or a capitalized class declaration.
 */
function findDeclarations(source: ts.SourceFile): Declaration[] {
  const found: Declaration[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (isComponentName(node.name.text)) {
        found.push({ name: node.name.text, kind: "function", node });
      }
    } else if (ts.isClassDeclaration(node) && node.name) {
      if (isComponentName(node.name.text)) {
        found.push({ name: node.name.text, kind: "class", node });
      }
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !isComponentName(decl.name.text)) {
          continue;
        }
        const init = decl.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          found.push({ name: decl.name.text, kind: "const", node: decl });
        }
      }
    } else if (
      ts.isExportAssignment(node) &&
      (ts.isArrowFunction(node.expression) ||
        ts.isFunctionExpression(node.expression))
    ) {
      found.push({ name: "default", kind: "default", node });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

/**
 * Collects literal `id` and `className` values from a module's JSX.
 *
 * Only static strings qualify: a dynamic value such as
 * `className={styles.root}` produces nothing the rendered DOM can be matched
 * against, and recording it would only add noise.
 */
function findDomHints(source: ts.SourceFile, file: string): Array<{
  key: string;
  location: ComponentLocation;
}> {
  const hints: Array<{ key: string; location: ComponentLocation }> = [];

  const record = (key: string, node: ts.Node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    hints.push({
      key,
      location: {
        name: key,
        file,
        line: line + 1,
        column: character + 1,
        kind: "function",
      },
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attr = node.name.getText(source);
      if (attr === "id" || attr === "className") {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) {
          if (attr === "id") {
            const value = init.text.trim();
            if (value) record(`id:${value}`, node);
          } else {
            for (const token of init.text.split(/\s+/)) {
              const value = token.trim();
              if (value) record(`class:${value}`, node);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return hints;
}

export function buildComponentIndex(rootDir: string): ComponentIndex {
  const components: Record<string, ComponentLocation[]> = {};
  const domHints: Record<string, ComponentLocation[]> = {};

  for (const filePath of collectSourceFiles(rootDir)) {
    let text: string;
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const source = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const projectPath = relative(rootDir, filePath).split(sep).join("/");
    for (const decl of findDeclarations(source)) {
      const { line, character } = source.getLineAndCharacterOfPosition(
        decl.node.getStart(source),
      );
      (components[decl.name] ??= []).push({
        name: decl.name,
        file: projectPath,
        // Editors and terminals are 1-based; TypeScript's positions are 0-based.
        line: line + 1,
        column: character + 1,
        kind: decl.kind,
      });
    }

    for (const hint of findDomHints(source, projectPath)) {
      (domHints[hint.key] ??= []).push(hint.location);
    }
  }

  return { generatedAt: Date.now(), rootDir, components, domHints };
}

let cachedIndex: ComponentIndex | null = null;

export function getComponentIndex(rootDir: string): ComponentIndex {
  if (!cachedIndex || cachedIndex.rootDir !== rootDir) {
    cachedIndex = buildComponentIndex(rootDir);
  }
  return cachedIndex;
}

export function resetComponentIndexCache(): void {
  cachedIndex = null;
}

/**
 * Resolves a component name to the most plausible declaring module.
 *
 * Several files can declare the same name (a page and its skeleton, for
 * example). A single match wins outright; otherwise an exact `name.tsx`
 * filename breaks the tie, which is the dominant convention in this codebase.
 */
export function resolveComponent(
  index: ComponentIndex,
  name: string,
): ComponentLocation | null {
  const candidates = index.components[name];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const exact = candidates.find((candidate) =>
    candidate.file.endsWith(`/${name}.tsx`),
  );
  return exact ?? candidates[0];
}

/**
 * Resolves the nearest resolvable entry in a fiber ancestor chain.
 *
 * The browser sends every ancestor component, closest first, because framework
 * internals such as Next's `SegmentViewNode` sit between the markup and the
 * app's own component. The first name the index knows about is the one a
 * developer is pointing at; the rest are runtime plumbing that has no file in
 * this repository.
 */
export function resolveComponentChain(
  index: ComponentIndex,
  chain: readonly string[],
): { name: string; location: ComponentLocation } | null {
  for (const name of chain) {
    const location = resolveComponent(index, name);
    if (location) return { name, location };
  }
  return null;
}

export type DomProbe = {
  /** `element.id`, if present. */
  id?: string;
  /** `element.classList` tokens, most specific first. */
  classes?: string[];
  /**
   * `{ id, classes }` for each ancestor, nearest first. Many elements carry no
   * identifying attributes of their own (`<input>` inside a labelled wrapper),
   * so the nearest ancestor that does is the useful answer.
   */
  ancestors?: Array<{ id?: string; classes?: string[] }>;
};

export type DomProbeMatch = {
  name: string;
  location: ComponentLocation;
  /**
   * True when the winning hint identifies exactly one place in the source (a
   * unique `id`, or a class token used once). Such a match points directly at
   * the markup for this element and is trusted over the fiber chain, which can
   * stop at a wrapper such as `IntlProvider`.
   */
  confident: boolean;
};

/**
 * Finds the component declaration that encloses a position.
 *
 * A DOM hint points at the attribute, not at the component, so the panel would
 * otherwise show a file path where a component name belongs. Picking the last
 * declaration at or above the hint gives the component that rendered it.
 */
function enclosingComponent(
  index: ComponentIndex,
  location: ComponentLocation,
): ComponentLocation {
  const inFile = Object.values(index.components)
    .flat()
    .filter((candidate) => candidate.file === location.file)
    .sort((a, b) => a.line - b.line);
  let enclosing: ComponentLocation | undefined;
  for (const candidate of inFile) {
    if (candidate.line <= location.line) enclosing = candidate;
    else break;
  }
  return enclosing ?? location;
}

/**
 * Scores a single `id`/class hint against the index.
 *
 * Returns the best enclosing component plus whether the hint is unique in the
 * source, which is what makes a match trustworthy enough to beat the fiber
 * chain.
 */
function scoreProbe(
  index: ComponentIndex,
  probe: { id?: string; classes?: string[] },
): DomProbeMatch | null {
  const id = probe.id?.trim();
  if (id) {
    const byId = index.domHints[`id:${id}`];
    if (byId && byId.length > 0) {
      const location = enclosingComponent(index, byId[0]);
      return { name: location.name, location, confident: byId.length === 1 };
    }
  }

  const ranked: Array<{ location: ComponentLocation; weight: number }> = [];
  let bestTokenCount = Number.POSITIVE_INFINITY;
  for (const token of probe.classes ?? []) {
    const clean = token.trim();
    if (!clean || clean.startsWith("__")) continue;
    const matches = index.domHints[`class:${clean}`];
    if (!matches || matches.length === 0) continue;
    bestTokenCount = Math.min(bestTokenCount, matches.length);
    // Fewer matches means the token identifies the component more precisely.
    const weight = 1 / matches.length;
    for (const location of matches) {
      ranked.push({ location, weight });
    }
  }

  if (ranked.length === 0) return null;

  const totals = new Map<string, { location: ComponentLocation; score: number }>();
  for (const { location, weight } of ranked) {
    const key = `${location.file}:${location.line}`;
    const entry = totals.get(key);
    if (entry) entry.score += weight;
    else totals.set(key, { location, score: weight });
  }

  const best = [...totals.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.location.file.split("/").length - a.location.file.split("/").length,
  )[0];
  const location = enclosingComponent(index, best.location);
  return { name: location.name, location, confident: bestTokenCount === 1 };
}

/**
 * Locates the markup that produced a rendered element by matching its literal
 * `id` and class tokens against the index.
 *
 * This is the fallback for React Server Components, which are invisible to the
 * browser: they never appear in the fiber tree and the flight payload carries
 * no source positions. The element itself is tried first, then its ancestors,
 * because a bare `<input>` has no attributes of its own but its labelled
 * wrapper does. The first confident match wins; otherwise the nearest scored
 * match is returned so the panel still shows something plausible.
 */
export function resolveDomProbe(
  index: ComponentIndex,
  probe: DomProbe,
): DomProbeMatch | null {
  const candidates: Array<{ id?: string; classes?: string[] }> = [
    { id: probe.id, classes: probe.classes },
    ...(probe.ancestors ?? []),
  ];

  let fallback: DomProbeMatch | null = null;
  for (const candidate of candidates) {
    const match = scoreProbe(index, candidate);
    if (!match) continue;
    if (match.confident) return match;
    fallback ??= match;
  }
  return fallback;
}
