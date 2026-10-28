import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  buildComponentIndex,
  resolveComponent,
  resolveComponentChain,
  resolveDomProbe,
} from "../../src/server/devtools/component-source";

function withFixture(files: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "component-source-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolute = join(root, relativePath);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, contents);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("indexes function, const, class, and default component declarations", () => {
  withFixture(
    {
      "src/components/widget.tsx": [
        "export function Widget() { return null; }",
        "export const Panel = () => null;",
        "export class Legacy extends Object {}",
        "export default function WidgetPage() { return null; }",
      ].join("\n"),
    },
    (root) => {
      const index = buildComponentIndex(root);
      assert.equal(index.components.Widget?.[0]?.kind, "function");
      assert.equal(index.components.Panel?.[0]?.kind, "const");
      assert.equal(index.components.Legacy?.[0]?.kind, "class");
      assert.equal(index.components.WidgetPage?.[0]?.kind, "function");
    },
  );
});

test("reports one-based line and column of the declaration", () => {
  withFixture(
    {
      "src/components/card.tsx": [
        'import type { ReactNode } from "react";',
        "",
        "type Props = { children?: ReactNode };",
        "",
        "export function Card({ children }: Props) {",
        "  return <div>{children}</div>;",
        "}",
      ].join("\n"),
    },
    (root) => {
      const index = buildComponentIndex(root);
      const location = resolveComponent(index, "Card");
      assert.ok(location);
      assert.equal(location.file, "src/components/card.tsx");
      assert.equal(location.line, 5);
      assert.equal(location.column, 1);
    },
  );
});

test("ignores lowercase functions, test files, and non-tsx sources", () => {
  withFixture(
    {
      "src/lib/helpers.tsx": "export function helper() { return 1; }",
      "src/components/thing.test.tsx": "export function Thing() { return null; }",
      "src/server/data.ts": "export function DataThing() { return null; }",
    },
    (root) => {
      const index = buildComponentIndex(root);
      assert.equal(index.components.helper, undefined);
      assert.equal(index.components.Thing, undefined);
      assert.equal(index.components.DataThing, undefined);
    },
  );
});

test("prefers the file named after the component when names collide", () => {
  withFixture(
    {
      "src/components/aaa-skeleton.tsx": "export function Card() { return null; }",
      "src/components/Card.tsx": "export function Card() { return null; }",
    },
    (root) => {
      const index = buildComponentIndex(root);
      const location = resolveComponent(index, "Card");
      assert.equal(location?.file, "src/components/Card.tsx");
    },
  );
});

test("returns null for an unknown component name", () => {
  withFixture(
    { "src/components/known.tsx": "export function Known() { return null; }" },
    (root) => {
      const index = buildComponentIndex(root);
      assert.equal(resolveComponent(index, "Missing"), null);
    },
  );
});

test("chain resolution skips framework internals and stops at the app component", () => {
  withFixture(
    {
      "src/components/home/hero.tsx":
        "export function Hero() { return <h1>hi</h1>; }",
    },
    (root) => {
      const index = buildComponentIndex(root);
      const match = resolveComponentChain(index, [
        "SegmentViewNode",
        "LayoutRouter",
        "Hero",
        "Section",
      ]);
      assert.ok(match);
      assert.equal(match.name, "Hero");
      assert.equal(match.location.file, "src/components/home/hero.tsx");
    },
  );
});

test("chain resolution returns null when nothing in the chain is known", () => {
  withFixture(
    { "src/components/home/hero.tsx": "export function Hero() { return null; }" },
    (root) => {
      const index = buildComponentIndex(root);
      assert.equal(
        resolveComponentChain(index, ["SegmentViewNode", "LayoutRouter"]),
        null,
      );
    },
  );
});

test("indexes literal id and class attributes, ignoring dynamic values", () => {
  withFixture(
    {
      "src/components/home/search.tsx": [
        "export function Search() {",
        '  return <section id="home-search" className="search shell">',
        '    <input className={styles.field} />',
        "  </section>;",
        "}",
      ].join("\n"),
    },
    (root) => {
      const index = buildComponentIndex(root);
      assert.ok(index.domHints["id:home-search"]);
      assert.ok(index.domHints["class:search"]);
      assert.ok(index.domHints["class:shell"]);
      assert.equal(index.domHints["class:styles.field"], undefined);
    },
  );
});

test("DOM probe resolves a unique id to its enclosing component", () => {
  withFixture(
    {
      "src/components/home/search.tsx": [
        "export function Search() {",
        '  return <section id="home-search"><h2>x</h2></section>;',
        "}",
      ].join("\n"),
    },
    (root) => {
      const index = buildComponentIndex(root);
      const match = resolveDomProbe(index, { id: "home-search" });
      assert.ok(match);
      assert.equal(match.name, "Search");
      assert.equal(match.confident, true);
    },
  );
});

test("DOM probe walks ancestors when the element itself has no hints", () => {
  withFixture(
    {
      "src/components/home/search.tsx": [
        "export function Search() {",
        '  return <label className="search-field"><input /></label>;',
        "}",
      ].join("\n"),
    },
    (root) => {
      const index = buildComponentIndex(root);
      const match = resolveDomProbe(index, {
        id: "",
        classes: [],
        ancestors: [{ classes: ["search-field"] }],
      });
      assert.ok(match);
      assert.equal(match.name, "Search");
      assert.equal(match.confident, true);
    },
  );
});

test("DOM probe marks a class shared by many components as not confident", () => {
  withFixture(
    {
      "src/components/a.tsx": "export function A() { return <div className=\"shell\">a</div>; }",
      "src/components/b.tsx": "export function B() { return <div className=\"shell\">b</div>; }",
    },
    (root) => {
      const index = buildComponentIndex(root);
      const match = resolveDomProbe(index, { classes: ["shell"] });
      assert.ok(match);
      assert.equal(match.confident, false);
    },
  );
});

test("DOM probe returns null when nothing matches", () => {
  withFixture(
    { "src/components/a.tsx": "export function A() { return <div className=\"a\">a</div>; }" },
    (root) => {
      const index = buildComponentIndex(root);
      assert.equal(resolveDomProbe(index, { classes: ["nope"] }), null);
    },
  );
});
