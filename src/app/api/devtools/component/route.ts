import { NextResponse } from "next/server";
import {
  getComponentIndex,
  resolveComponent,
  resolveComponentChain,
  resolveDomProbe,
} from "@/server/devtools/component-source";

export const dynamic = "force-dynamic";

const MAX_CHAIN = 60;
const MAX_CLASSES = 24;
const MAX_ANCESTORS = 12;

function disabled() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Development-only endpoint backing the component inspector overlay.
 *
 * The overlay reads component names off the React fiber and asks this route
 * where they are declared, because React 19 no longer exposes source locations
 * to the browser. It answers 404 outside development so the route cannot leak
 * filesystem paths from a deployed build.
 *
 * `GET ?name=X` resolves a single name. `POST { chain, id, classes }` first
 * walks the fiber ancestor chain, then falls back to matching the element's
 * literal `id`/class tokens against the JSX that produced it. The fallback
 * exists because React Server Components are invisible to the browser — they
 * are absent from the fiber tree, so the chain alone cannot locate them.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return disabled();

  const name = new URL(request.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { error: "Missing required `name` query parameter" },
      { status: 400 },
    );
  }

  const index = getComponentIndex(process.cwd());
  const location = resolveComponent(index, name);
  if (!location) {
    return NextResponse.json({ name, found: false }, { status: 404 });
  }

  return NextResponse.json({ name, found: true, location });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return disabled();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as {
    chain?: unknown;
    id?: unknown;
    classes?: unknown;
    ancestors?: unknown;
  };

  const chain = Array.isArray(payload.chain)
    ? payload.chain
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, MAX_CHAIN)
    : [];
  const classes = Array.isArray(payload.classes)
    ? payload.classes
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, MAX_CLASSES)
    : [];
  const id = typeof payload.id === "string" ? payload.id : undefined;
  const ancestors = Array.isArray(payload.ancestors)
    ? payload.ancestors
        .slice(0, MAX_ANCESTORS)
        .map((entry) => {
          const record = (entry ?? {}) as { id?: unknown; classes?: unknown };
          return {
            id: typeof record.id === "string" ? record.id : undefined,
            classes: Array.isArray(record.classes)
              ? record.classes
                  .filter((token): token is string => typeof token === "string")
                  .slice(0, MAX_CLASSES)
              : [],
          };
        })
    : [];

  if (chain.length === 0 && classes.length === 0 && !id && ancestors.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of `chain`, `id`, `classes`, or `ancestors`" },
      { status: 400 },
    );
  }

  const index = getComponentIndex(process.cwd());
  const domMatch = resolveDomProbe(index, { id, classes, ancestors });
  // A hint that identifies exactly one place in the source is trusted over the
  // fiber chain: the chain stops at the nearest framework wrapper, which can be
  // an `IntlProvider` rather than the component that rendered the markup.
  const match =
    domMatch && domMatch.confident
      ? domMatch
      : resolveComponentChain(index, chain) ?? domMatch;
  if (!match) {
    return NextResponse.json({ found: false, chain }, { status: 404 });
  }

  return NextResponse.json({
    found: true,
    name: match.name,
    location: match.location,
    via: domMatch && domMatch === match ? "dom" : "fiber",
  });
}
