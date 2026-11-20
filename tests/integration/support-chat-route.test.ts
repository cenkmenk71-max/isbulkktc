import assert from "node:assert/strict";
import test from "node:test";

import { supportChatRateLimiter } from "@/features/abuse/limits";

const route = () => import("@/app/api/support/chat/route");

function request(body: string): Request {
  return new Request("https://isbulkktc.test/api/support/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function resetRateLimit(): void {
  supportChatRateLimiter.clear();
}

test("support chat rejects an oversized request body before parsing JSON", async () => {
  resetRateLimit();
  const { POST } = await route();

  const response = await POST(
    request(JSON.stringify({ message: "x".repeat(9 * 1024), locale: "en" })),
  );

  assert.equal(response.status, 413);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "request_too_large" });
});

test("support chat rejects invalid JSON with a no-store response", async () => {
  resetRateLimit();
  const { POST } = await route();

  const response = await POST(request("{ invalid"));

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "invalid_json" });
});

test("support chat keeps the semantic message-length boundary after the byte cap", async () => {
  resetRateLimit();
  const { POST } = await route();

  const response = await POST(
    request(JSON.stringify({ message: "x".repeat(1001), locale: "en" })),
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "message_too_long" });
});
