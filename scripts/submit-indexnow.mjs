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

// The generic endpoint shares a submission with every IndexNow participant, but
// it refuses hosts whose key it has not finished validating. Bing's own endpoint
// accepts the same payload, so try both and treat the run as successful if either
// takes it.
const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
];
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

async function readSitemapUrls(sourceOrigin) {
  const response = await fetch(new URL("/sitemap.xml", sourceOrigin));
  if (!response.ok) {
    throw new Error(`Sitemap responded ${response.status} from ${sourceOrigin}.`);
  }
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function main() {
  const origin = new URL(process.argv[2] ?? "https://isbulkktc.com");
  // The public hostname sits behind Cloudflare, whose bot protection answers a
  // managed challenge to datacenter egress such as GitHub's runners. The Vercel
  // deployment alias serves the same build — and therefore the same sitemap and
  // key file — without that challenge, so a scheduler can read them from there
  // while the submitted URLs stay on the canonical host.
  const sourceOrigin = new URL(
    process.env.INDEXNOW_SITEMAP_ORIGIN ?? origin,
  );
  const key = await readKey();
  const urlList = await readSitemapUrls(sourceOrigin);

  if (urlList.length === 0) {
    throw new Error("The sitemap advertised no URLs.");
  }

  const body = {
    host: origin.host,
    key,
    keyLocation: new URL(`/${key}.txt`, origin).toString(),
    urlList,
  };

  const failures = [];

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });

    // IndexNow answers 200 (accepted) or 202 (accepted, key pending validation);
    // anything else means the submission was rejected outright.
    if (response.status === 200 || response.status === 202) {
      console.log(
        `Submitted ${urlList.length} URLs to ${endpoint} (HTTP ${response.status}).`,
      );
      return;
    }

    failures.push(`${endpoint} -> ${response.status} ${await response.text()}`);
  }

  throw new Error(`IndexNow rejected every endpoint:\n${failures.join("\n")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
