import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const proxySource = readFileSync(
  new URL("../../src/proxy.ts", import.meta.url),
  "utf8",
);
const nextConfigSource = readFileSync(
  new URL("../../next.config.ts", import.meta.url),
  "utf8",
);
const escapedHostMatcher = String.raw`value: "^hooks\\.isbulkktc\\.com\\.?$"`;

test("the dedicated mail host runs Proxy on every path, including API and static paths", () => {
  assert.ok(proxySource.includes('source: "/:path*"'));
  assert.ok(proxySource.includes("locale: false"));
  assert.ok(proxySource.includes(escapedHostMatcher));
  assert.ok(proxySource.includes("isMailIngressHost(request.nextUrl.hostname)"));
  assert.ok(proxySource.includes("isAllowedMailIngressRequest(request.method, pathname)"));
});

test("the dedicated mail host is noindex and uncacheable", () => {
  assert.ok(nextConfigSource.includes(escapedHostMatcher));
  assert.ok(nextConfigSource.includes('{ key: "X-Robots-Tag", value: "noindex, nofollow" }'));
  assert.ok(nextConfigSource.includes('{ key: "Cache-Control", value: "no-store" }'));
});

test("the live Proxy guard rejects pages, unrelated APIs, the Resend webhook and non-POST methods", async () => {
  const requests = [
    new NextRequest("https://hooks.isbulkktc.com/"),
    new NextRequest("https://hooks.isbulkktc.com/login"),
    new NextRequest("https://hooks.isbulkktc.com/api/push/dispatch", { method: "POST" }),
    new NextRequest("https://hooks.isbulkktc.com/api/email/resend-webhook", { method: "GET" }),
    new NextRequest("https://hooks.isbulkktc.com/api/email/acquisition-campaign", { method: "POST" }),
  ];

  for (const request of requests) {
    const response = await proxy(request);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
  }
});

test("the live Proxy guard forwards an allowlisted POST to its authenticated route handler", async () => {
  const response = await proxy(
    new NextRequest("https://hooks.isbulkktc.com/api/email/resend-webhook", { method: "POST" }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});
