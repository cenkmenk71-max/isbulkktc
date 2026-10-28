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

export function buildComponentIndex(rootDir: string): ComponentIndex {
  const components: Record<string, ComponentLocation[]> = {};

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
  }

  return { generatedAt: Date.now(), rootDir, components };
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
