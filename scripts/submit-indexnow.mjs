#!/usr/bin/env node
// Submits every URL in the live sitemap to IndexNow, which Bing and Yandex
// consume directly and share with each other. Google ignores IndexNow, so this
// accelerates discovery on the engines that support it while Search Console
// handles Google.
//
// Usage: node scripts/submit-indexnow.mjs [origin]
// The key file is read from `public/<key>.txt`; IndexNow requires it to be
// reachable at https://<host>/<key>.txt, which the deployed site serves.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readKey() {
  const publicDir = path.join(projectRoot, "public");
  const entries = await readdir(publicDir);
  const keyFile = entries.find((name) => /^[a-z0-9]{8,128}\.txt$/i.test(name));
  if (!keyFile) {
    throw new Error("No IndexNow key file found in public/.");
  }
  const key = (await readFile(path.join(publicDir, keyFile), "utf8")).trim();
  return key;
}

async function readSitemapUrls(origin) {
  const response = await fetch(new URL("/sitemap.xml", origin));
  if (!response.ok) {
    throw new Error(`Sitemap responded ${response.status}.`);
  }
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function main() {
  const origin = new URL(process.argv[2] ?? "https://isbulkktc.com");
  const key = await readKey();
  const urlList = await readSitemapUrls(origin);

  if (urlList.length === 0) {
    throw new Error("The sitemap advertised no URLs.");
  }

  const body = {
    host: origin.host,
    key,
    keyLocation: new URL(`/${key}.txt`, origin).toString(),
    urlList,
  };

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  // IndexNow answers 200 (accepted) or 202 (accepted, key pending validation);
  // anything else means the submission was rejected outright.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(
      `IndexNow rejected the submission: ${response.status} ${await response.text()}`,
    );
  }

  console.log(
    `Submitted ${urlList.length} URLs to IndexNow (HTTP ${response.status}).`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
