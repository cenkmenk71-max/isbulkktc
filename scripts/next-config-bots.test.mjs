import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { shouldServeStreamingMetadata } from "next/dist/server/lib/streaming-metadata.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Recompile the `htmlLimitedBots` regex straight out of `next.config.ts` so the
 * assertions track the shipped config value instead of a copy that can drift.
 */
function loadHtmlLimitedBots() {
  const source = readFileSync(path.join(REPO_ROOT, "next.config.ts"), "utf8");
  const match = source.match(/htmlLimitedBots:\s*\/((?:\\.|[^/\\])+)\/([a-z]*)/);
  assert.ok(match, "next.config.ts must define htmlLimitedBots as a regex literal");
  return new RegExp(match[1], match[2]);
}

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const bot = loadHtmlLimitedBots();

test("Googlebot gets blocking metadata, so its canonical stays inside <head>", () => {
  // Next's default list matches `Google-*` service crawlers but not plain
  // `Googlebot`, the one Google crawler that renders JavaScript. Without this
  // entry `shouldServeStreamingMetadata` returns true and React intermittently
  // appends the canonical after `</head>`, where Google ignores it.
  assert.equal(shouldServeStreamingMetadata(GOOGLEBOT_UA, bot.source), false);
  assert.equal(shouldServeStreamingMetadata("Googlebot-Image/1.0", bot.source), false);
});

test("the Next default list really does stream metadata for Googlebot", () => {
  // Guards the regression itself: if this ever stops being true the override
  // above is no longer needed, and this test says so loudly.
  assert.equal(shouldServeStreamingMetadata(GOOGLEBOT_UA, undefined), true);
});

test("every HTML-limited bot Next ships by default is still blocking-rendered", () => {
  for (const ua of [
    "Mediapartners-Google",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "Google-InspectionTool",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
  ]) {
    assert.equal(shouldServeStreamingMetadata(ua, bot.source), false, `${ua} must be blocking`);
  }
});

test("JavaScript-capable browsers keep streaming metadata", () => {
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "curl/8.7.1",
    "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  ]) {
    assert.equal(shouldServeStreamingMetadata(ua, bot.source), true, `${ua} must stream`);
  }
});
