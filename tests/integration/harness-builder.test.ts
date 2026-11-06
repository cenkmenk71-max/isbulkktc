import assert from "node:assert/strict";
import test from "node:test";

import {
  installBoundaryMocks,
  recorded,
  resetBoundary,
  type SupabaseCall,
} from "./support/harness";

installBoundaryMocks();

/**
 * The fake `rpc(...)` must reproduce the surface of the real `PostgrestBuilder`.
 *
 * The app path calls `.rpc("submit_feedback", …).setHeader("x-client-ip", ip)`
 * so the DB throttle can key on the visitor address (#206, #393). A plain
 * `Promise.resolve()` has no `setHeader`, so a fake that returns one makes the
 * real production code throw `TypeError: ….setHeader is not a function` inside
 * this layer. These tests pin the builder contract so that regression is caught
 * here — as a harness defect — instead of surfacing as an unexplained red in a
 * downstream lane's action tests.
 */

function rpcCalls(): Extract<SupabaseCall, { kind: "rpc" }>[] {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "rpc" }> => call.kind === "rpc",
  );
}

test("rpc() returns a thenable builder with a chainable setHeader", async () => {
  const builder = resetBoundary({ rpcs: { f: { data: "ok", error: null } } }).rpc("f", { a: 1 });

  assert.equal(
    typeof builder.setHeader,
    "function",
    "the fake rpc builder must expose setHeader, or real `.rpc(...).setHeader(...)` calls throw",
  );
  assert.equal(
    typeof (builder as unknown as PromiseLike<unknown>).then,
    "function",
    "the fake rpc builder must stay thenable so `await …rpc(...)` keeps working",
  );

  const chained = builder.setHeader("x-client-ip", "203.0.113.7");
  assert.equal(
    typeof (chained as unknown as { setHeader?: unknown }).setHeader,
    "function",
    "setHeader must return the builder (chainable), not a bare promise",
  );

  // Awaiting after the header write must still resolve to the scripted outcome.
  assert.deepEqual(await chained, { data: "ok", error: null });
});

test("setHeader is recorded on the rpc call so a test can assert the value sent", async () => {
  const supabase = resetBoundary({
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });

  await supabase
    .rpc("submit_feedback", { _message: "hello" })
    .setHeader("x-client-ip", "198.51.100.5");

  assert.deepEqual(rpcCalls(), [
    {
      kind: "rpc",
      name: "submit_feedback",
      args: { _message: "hello" },
      headers: { "x-client-ip": "198.51.100.5" },
    },
  ]);
});

test("a later setHeader for the same name wins, matching Headers.set", async () => {
  const supabase = resetBoundary({ rpcs: { f: { data: null, error: null } } });

  await supabase
    .rpc("f")
    .setHeader("x-client-ip", "198.51.100.1")
    .setHeader("x-client-ip", "198.51.100.2");

  assert.deepEqual(rpcCalls()[0].headers, { "x-client-ip": "198.51.100.2" });
});

test("an rpc call with no setHeader records no headers", async () => {
  const supabase = resetBoundary({ rpcs: { f: { data: null, error: null } } });

  await supabase.rpc("f", { a: 1 });

  assert.equal(rpcCalls()[0].headers, undefined);
});

test("a function rpc outcome still receives the args through the builder", async () => {
  const seen: Record<string, unknown>[] = [];
  const supabase = resetBoundary({
    rpcs: {
      f: (args) => {
        seen.push(args);
        return { data: args, error: null };
      },
    },
  });

  const result = await supabase.rpc("f", { a: 1 }).setHeader("x-client-ip", "203.0.113.9");

  assert.deepEqual(result, { data: { a: 1 }, error: null });
  assert.deepEqual(seen, [{ a: 1 }]);
});
