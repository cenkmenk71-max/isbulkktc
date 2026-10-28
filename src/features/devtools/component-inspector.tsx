"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Development-only component inspector.
 *
 * Alt+Shift+C (or `?inspect=1`) turns the page into a picker: hovering outlines
 * the element under the cursor and shows the React component that owns it,
 * clicking pins a panel with the component name, source location, DOM path,
 * and props. The overlay is rendered into a shadow root so page styles cannot
 * bleed into it, and it never ships outside development.
 */

type ResolvedLocation = {
  name: string;
  file: string;
  line: number;
  column: number;
  kind: "function" | "class" | "const" | "default";
};

type Selection = {
  component: string | null;
  tag: string;
  domPath: string;
  props: Record<string, unknown>;
  location: ResolvedLocation | null;
  lookup: "idle" | "loading" | "found" | "missing";
};

const OVERLAY_ID = "component-inspector-root";

/**
 * Styles live here rather than in `global.css` so they ship only with the
 * development-only chunk. Every rule is prefixed with `.component-inspector`
 * to keep the injected sheet from affecting the page.
 */
const INSPECTOR_STYLES = `
.component-inspector {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #f5f2eb;
}
.component-inspector-toggle {
  pointer-events: auto;
  padding: 8px 14px;
  border: 1px solid rgba(245, 242, 235, 0.28);
  border-radius: 999px;
  background: #1a1a1a;
  color: #f5f2eb;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
}
.component-inspector[data-active="true"] .component-inspector-toggle {
  background: #0d5c3a;
  border-color: #0d5c3a;
}
.component-inspector-hint {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(26, 26, 26, 0.92);
  color: rgba(245, 242, 235, 0.82);
}
.component-inspector-hint kbd {
  padding: 1px 4px;
  border: 1px solid rgba(245, 242, 235, 0.32);
  border-radius: 4px;
  font: inherit;
}
.component-inspector-panel {
  pointer-events: auto;
  width: min(460px, calc(100vw - 32px));
  max-height: min(60vh, 520px);
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid rgba(245, 242, 235, 0.16);
  border-radius: 10px;
  background: rgba(26, 26, 26, 0.96);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
}
.component-inspector-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  padding: 3px 0;
}
.component-inspector-label {
  color: rgba(245, 242, 235, 0.55);
}
.component-inspector-panel code {
  min-width: 0;
  color: #b9f0d0;
  white-space: pre-wrap;
  word-break: break-word;
}
.component-inspector-path {
  color: rgba(245, 242, 235, 0.72) !important;
}
.component-inspector-muted {
  color: rgba(245, 242, 235, 0.42) !important;
}
.component-inspector-props code {
  max-height: 180px;
  overflow: auto;
}
.component-inspector-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(245, 242, 235, 0.14);
}
.component-inspector-actions button {
  padding: 5px 10px;
  border: 1px solid rgba(245, 242, 235, 0.28);
  border-radius: 6px;
  background: transparent;
  color: #f5f2eb;
  font: inherit;
  cursor: pointer;
}
.component-inspector-actions button:hover {
  background: rgba(245, 242, 235, 0.1);
}
`;

function findFiberKey(element: Element): string | undefined {
  return Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
}

/**
 * React names host elements by their tag but components by their function or
 * display name. Walking up `return` finds the nearest owner that has a name,
 * which is what a developer wants to see when they point at some markup.
 */
function componentNameFor(element: Element): string | null {
  const key = findFiberKey(element);
  if (!key) return null;

  let fiber = (element as unknown as Record<string, unknown>)[key] as
    | { type?: unknown; return?: unknown }
    | undefined;

  for (let depth = 0; fiber && depth < 60; depth += 1) {
    const type = fiber.type;
    if (typeof type === "function") {
      const named = type as { displayName?: string; name?: string };
      const name = named.displayName || named.name;
      if (name && /^[A-Z]/.test(name)) return name;
    } else if (typeof type === "object" && type !== null) {
      // forwardRef/memo wrappers keep the name on `render` or `type`.
      const wrapper = type as {
        displayName?: string;
        render?: { displayName?: string; name?: string };
      };
      const name = wrapper.displayName || wrapper.render?.displayName || wrapper.render?.name;
      if (name && /^[A-Z]/.test(name)) return name;
    }
    fiber = fiber.return as typeof fiber;
  }
  return null;
}

function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList).slice(0, 2);
  const classText = classes.length > 0 ? `.${classes.join(".")}` : "";
  return `${element.tagName.toLowerCase()}${id}${classText}`;
}

function domPathFor(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const parentElement: Element | null = current.parentElement;
    const index = parentElement
      ? Array.from(parentElement.children).indexOf(current) + 1
      : 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parentElement;
  }
  return segments.join(" > ");
}

/**
 * Reads the props React recorded on the owning fiber. Values are coerced to a
 * JSON-safe shape so the panel can render functions and elements compactly.
 */
function propsFor(element: Element): Record<string, unknown> {
  const key = findFiberKey(element);
  if (!key) return {};
  let fiber = (element as unknown as Record<string, unknown>)[key] as
    | { type?: unknown; return?: unknown; memoizedProps?: unknown }
    | undefined;

  for (let depth = 0; fiber && depth < 60; depth += 1) {
    const type = fiber.type;
    if (typeof type === "function" || (typeof type === "object" && type !== null)) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object") {
        const out: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(props)) {
          out[name] = summarizeValue(value);
        }
        return out;
      }
    }
    fiber = fiber.return as typeof fiber;
  }
  return {};
}

function summarizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const kind = typeof value;
  if (kind === "string") {
    const text = value as string;
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  if (kind === "number" || kind === "boolean") return value;
  if (kind === "function") return `ƒ ${(value as { name?: string }).name || "anonymous"}()`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    const asElement = value as { $$typeof?: symbol };
    if (asElement.$$typeof) return "[React element]";
    return "[Object]";
  }
  return String(value);
}

export function ComponentInspector() {
  // `?inspect=1` opens the picker on load so it can be driven from a script or
  // a test; the initializer runs once, client-side only.
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("inspect") === "1";
  });
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [copied, setCopied] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hoveredElementRef = useRef<Element | null>(null);
  const activeRef = useRef(active);

  // Toggling is centralised here because turning the picker off also has to
  // drop the hover state and hide the highlight box.
  const toggleActive = useCallback((next: boolean) => {
    activeRef.current = next;
    setActive(next);
    if (!next) {
      hoveredElementRef.current = null;
      setHovered(null);
      if (boxRef.current) boxRef.current.style.display = "none";
    }
  }, []);

  const describe = useCallback((element: Element): Selection => {
    return {
      component: componentNameFor(element),
      tag: describeElement(element),
      domPath: domPathFor(element),
      props: propsFor(element),
      location: null,
      lookup: "idle",
    };
  }, []);

  const resolveLocation = useCallback(async (selection: Selection) => {
    if (!selection.component) return;
    setSelected((current) =>
      current && current.domPath === selection.domPath
        ? { ...current, lookup: "loading" }
        : current,
    );
    try {
      const response = await fetch(
        `/api/devtools/component?name=${encodeURIComponent(selection.component)}`,
      );
      const payload = (await response.json()) as {
        found?: boolean;
        location?: ResolvedLocation;
      };
      const location = payload.found && payload.location ? payload.location : null;
      setSelected((current) =>
        current && current.domPath === selection.domPath
          ? { ...current, location, lookup: location ? "found" : "missing" }
          : current,
      );
    } catch {
      setSelected((current) =>
        current && current.domPath === selection.domPath
          ? { ...current, lookup: "missing" }
          : current,
      );
    }
  }, []);

  // Create the shadow root once so page CSS cannot affect the highlight box,
  // and inject the overlay sheet into the document head for the panel.
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.componentInspector = "";
    style.textContent = INSPECTOR_STYLES;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    host.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    document.body.appendChild(host);
    hostRef.current = host;
    const shadow = host.attachShadow({ mode: "open" });
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;pointer-events:none;display:none;border:2px solid #0D5C3A;" +
      "background:rgba(13,92,58,0.14);border-radius:3px;transition:all .04s linear;";
    shadow.appendChild(box);
    boxRef.current = box;
    return () => {
      style.remove();
      host.remove();
    };
  }, []);

  // Toggle with Alt+Shift+C; `?inspect=1` already opened it on load.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyC") {
        event.preventDefault();
        toggleActive(!activeRef.current);
      }
      if (event.key === "Escape") {
        setSelected(null);
        toggleActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleActive]);

  // Track the pointer and paint the highlight box.
  useEffect(() => {
    const isOverlay = (node: Element | null) =>
      node instanceof Element &&
      (node.closest(`#${OVERLAY_ID}`) !== null ||
        node.closest("[data-component-inspector]") !== null);

    const onMove = (event: MouseEvent) => {
      if (!activeRef.current) return;
      const target = event.target as Element | null;
      if (!target || isOverlay(target)) return;
      if (target === hoveredElementRef.current) return;
      hoveredElementRef.current = target;

      const rect = target.getBoundingClientRect();
      const box = boxRef.current;
      if (box) {
        box.style.display = "block";
        box.style.left = `${rect.left}px`;
        box.style.top = `${rect.top}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
      }
      setHovered(describe(target));
    };

    const onClick = (event: MouseEvent) => {
      if (!activeRef.current) return;
      const target = event.target as Element | null;
      if (!target || isOverlay(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const selection = describe(target);
      setSelected(selection);
      void resolveLocation(selection);
    };

    // The overlay lives outside the page's shadow DOM, so its own clicks would
    // otherwise be swallowed by the capture-phase handler above.
    const root = hostRef.current;
    root?.addEventListener("click", (event) => event.stopPropagation());

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [describe, resolveLocation]);

  const copyReport = useCallback(async () => {
    if (!selected) return;
    const location = selected.location;
    const report = [
      `component: ${selected.component ?? "(unknown)"}`,
      `element:   ${selected.tag}`,
      location
        ? `source:    ${location.file}:${location.line}:${location.column} (${location.kind})`
        : "source:    (unresolved)",
      `dom:       ${selected.domPath}`,
      `props:     ${JSON.stringify(selected.props, null, 2)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable without a user gesture; the panel still
      // shows the report so it can be selected by hand.
    }
  }, [selected]);

  const detail = selected ?? hovered;

  return (
    <div
      data-component-inspector=""
      className="component-inspector"
      data-active={active ? "true" : "false"}
    >
      <button
        className="component-inspector-toggle"
        onClick={() => toggleActive(!active)}
        type="button"
        aria-pressed={active}
      >
        {active ? "Seçici açık" : "Bileşen seç"}
      </button>

      {active ? (
        <p className="component-inspector-hint">
          İmleci gezdir, seçmek için tıkla · kapatmak için <kbd>Alt</kbd>+
          <kbd>Shift</kbd>+<kbd>C</kbd> veya <kbd>Esc</kbd>
        </p>
      ) : null}

      {detail ? (
        <div className="component-inspector-panel">
          <div className="component-inspector-row">
            <span className="component-inspector-label">Bileşen</span>
            <code>{detail.component ?? "(bilinmiyor)"}</code>
          </div>
          <div className="component-inspector-row">
            <span className="component-inspector-label">Öğe</span>
            <code>{detail.tag}</code>
          </div>
          <div className="component-inspector-row">
            <span className="component-inspector-label">Kaynak</span>
            {selected ? (
              selected.lookup === "loading" ? (
                <code>aranıyor…</code>
              ) : selected.location ? (
                <code>
                  {selected.location.file}:{selected.location.line}:
                  {selected.location.column}
                </code>
              ) : (
                <code>(çözümlenemedi)</code>
              )
            ) : (
              <code className="component-inspector-muted">seçmek için tıkla</code>
            )}
          </div>
          <div className="component-inspector-row">
            <span className="component-inspector-label">DOM</span>
            <code className="component-inspector-path">{detail.domPath}</code>
          </div>
          {selected && Object.keys(selected.props).length > 0 ? (
            <div className="component-inspector-row component-inspector-props">
              <span className="component-inspector-label">Props</span>
              <code>{JSON.stringify(selected.props, null, 2)}</code>
            </div>
          ) : null}
          {selected ? (
            <div className="component-inspector-actions">
              <button onClick={copyReport} type="button">
                {copied ? "Kopyalandı" : "Raporu kopyala"}
              </button>
              <button onClick={() => setSelected(null)} type="button">
                Temizle
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
