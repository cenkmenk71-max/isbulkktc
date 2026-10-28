"use client";

import dynamic from "next/dynamic";

/**
 * Mounts the component inspector in development only.
 *
 * `process.env.NODE_ENV` is replaced with a literal at build time, so the
 * production bundle collapses this to `() => null` and the minifier drops the
 * now-unreachable `import()`. That keeps the inspector's code out of shipped
 * artifacts entirely rather than merely not rendering it.
 */
const ComponentInspector =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("./component-inspector").then(
            (module) => module.ComponentInspector,
          ),
        { ssr: false },
      )
    : () => null;

export { ComponentInspector as ComponentInspectorLoader };
