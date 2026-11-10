import { registerHooks } from "node:module";

/**
 * Neutralises the `server-only` marker for the `tsx --test` runner.
 *
 * `server-only` is a marker package: its `react-server` export condition is an
 * empty module and every other condition throws. A bundler picks the empty one
 * when compiling a server module, but `tsx --test` sets no such condition, so
 * any test that imports a guarded `src/server/**` module crashes on import.
 *
 * That collision is what kept `src/server/email/unsubscribe-token-core.ts`
 * unguarded (#102): adding `import "server-only"` there broke the behaviour test
 * that exercises the real HMAC functions. Resolving the marker to an empty
 * module keeps that test real — the production module body still runs — while
 * letting the guard be added.
 *
 * Import this module first, then reach the guarded module with a *dynamic*
 * `await import(...)`. A static import is hoisted above this side effect, so the
 * hook would not be installed in time.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export%20{}",
        shortCircuit: true,
        format: "module",
      };
    }
    return nextResolve(specifier, context);
  },
});
