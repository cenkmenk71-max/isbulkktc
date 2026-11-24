import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const headers = read("src/server/email/email-headers.ts");
const mailer = read("src/server/email/mailer.ts");
const digestRoute = read("src/app/api/email/engagement-digest/route.ts");
const signatureCore = read("src/server/email/unsubscribe-signature.ts");
const unsubscribeRoute = read("src/app/api/email/unsubscribe/route.ts");

test("the header emitter advertises one-click POST", () => {
  assert.match(headers, /"List-Unsubscribe-Post":\s*"List-Unsubscribe=One-Click"/);
  assert.match(headers, /"List-Unsubscribe":/);
});

test("the mailer hands the promotional family a URL to advertise", () => {
  assert.match(mailer, /buildEmailHeaders\(\{[\s\S]*?unsubscribeUrl:/);
});

test("the advertised URL is the path the route actually serves", () => {
  assert.match(digestRoute, /unsubscribeUrlFor\(/);
  assert.match(signatureCore, /new URL\(\s*"\/api\/email\/unsubscribe"/);
});

test("the ordinary GET body link is read-only and the advertised POST performs opt-out", () => {
  assert.ok(existsSync(new URL("../../src/app/api/email/unsubscribe/route.ts", import.meta.url)));
  const getBody = unsubscribeRoute.slice(
    unsubscribeRoute.indexOf("export async function GET"),
    unsubscribeRoute.indexOf("export async function POST"),
  );
  const postBody = unsubscribeRoute.slice(unsubscribeRoute.indexOf("export async function POST"));
  assert.match(getBody, /confirmationPage\(request, getLocale\(request\)\)/);
  assert.doesNotMatch(getBody, /optOut\(|supabase\.rpc|createSupabaseServiceClient/);
  assert.match(postBody, /optOut\(email, signature, getLocale\(request\)\)/);
});

test("the POST verifies the signed address before the service-role mutation", () => {
  const verifyIndex = unsubscribeRoute.indexOf("verifyUnsubscribeSignature(email, signature)");
  const serviceIndex = unsubscribeRoute.indexOf("createSupabaseServiceClient()");
  const rpcIndex = unsubscribeRoute.indexOf('supabase.rpc("opt_out_engagement"');
  assert.ok(verifyIndex > -1 && serviceIndex > -1 && rpcIndex > -1);
  assert.ok(verifyIndex < serviceIndex);
  assert.ok(verifyIndex < rpcIndex);
});
