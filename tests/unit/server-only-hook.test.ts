import "./support/server-only-hook";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * Guards the guard. The hook in `./support/server-only-hook` is what lets any
 * `tsx --test` suite import a `server-only`-guarded `src/server/**` module; if
 * it silently stopped working, every such suite would go red for a reason that
 * looks like a product bug. This test pins the behaviour it depends on:
 * `server-only` is a marker package whose non-`react-server` export throws, so
 * importing it here only succeeds because the hook resolves it to an empty
 * module.
 */
test("the hook makes the server-only marker importable under tsx --test", async () => {
  await assert.doesNotReject(() => import("server-only"));
});
