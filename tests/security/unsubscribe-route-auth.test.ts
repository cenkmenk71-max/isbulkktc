import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../src/app/api/email/unsubscribe/route.ts", import.meta.url),
  "utf8",
);

test("unsubscribe POST verifies the signed address before creating a service client", () => {
  const verifyIndex = source.indexOf("verifyUnsubscribeSignature(email, signature)");
  const serviceIndex = source.indexOf("createSupabaseServiceClient()");
  const rpcIndex = source.indexOf('supabase.rpc("opt_out_engagement"');
  assert.ok(verifyIndex > -1 && serviceIndex > -1 && rpcIndex > -1);
  assert.ok(verifyIndex < serviceIndex);
  assert.ok(verifyIndex < rpcIndex);
});

test("a failed signature returns 400 without reaching the write", () => {
  assert.match(
    source,
    /!isValidUnsubscribeLink\(email, signature\)[\s\S]{0,100}status: 400/,
  );
});

test("the address length is bounded before the HMAC operation", () => {
  assert.match(source, /email\.length\s*>=\s*3/);
  assert.match(source, /email\.length\s*<=\s*254/);
});

test("GET validates and renders confirmation without touching the mutation path", () => {
  const getBody = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("export async function POST"),
  );
  assert.match(getBody, /isValidUnsubscribeLink\(email, signature\)/);
  assert.match(getBody, /confirmationPage\(request\)/);
  assert.doesNotMatch(getBody, /optOut\(|createSupabaseServiceClient|supabase\.rpc/);
});

test("POST is the only route handler that invokes the opt-out mutation", () => {
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(postBody, /optOut\(email, signature\)/);
  const getBody = source.slice(
    source.indexOf("export async function GET"),
    source.indexOf("export async function POST"),
  );
  assert.doesNotMatch(getBody, /optOut\(/);
});

test("the success body is fixed and does not disclose subscription state", () => {
  const copies = source.match(/tanıtım e-postalarından çıkarıldı/g) ?? [];
  assert.equal(copies.length, 1);
  assert.ok(!/Response\([^)]*error\.message/.test(source));
});

test("the token comparison is constant-time and checks length first", () => {
  const core = readFileSync(
    new URL("../../src/server/email/unsubscribe-signature.ts", import.meta.url),
    "utf8",
  );
  assert.match(core, /timingSafeEqual/);
  assert.match(core, /length\s*!==/);
});
