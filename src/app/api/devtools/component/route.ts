import { NextResponse } from "next/server";
import {
  getComponentIndex,
  resolveComponent,
} from "@/server/devtools/component-source";

export const dynamic = "force-dynamic";

/**
 * Development-only endpoint backing the component inspector overlay.
 *
 * The overlay reads a component name off the React fiber and asks this route
 * where that component is declared, because React 19 no longer exposes source
 * locations to the browser. It answers 404 outside development so the route
 * cannot leak filesystem paths from a deployed build.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
