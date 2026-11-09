import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readIndexNowKey } from "./indexnow-key.mjs";

const KEY = "isbulkktcada1d9ce6917a3363df4ff8fccc7629a";

async function withPublicDir(files, run) {
  const dir = await mkdtemp(path.join(tmpdir(), "indexnow-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      await writeFile(path.join(dir, name), body);
    }
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("picks the file whose name equals its body", async () => {
  await withPublicDir({ [`${KEY}.txt`]: KEY }, async (dir) => {
    assert.deepEqual(await readIndexNowKey(dir), { key: KEY, file: `${KEY}.txt` });
  });
});

test("ignores a matching-named file whose body differs, even when it sorts first", async () => {
  await withPublicDir(
    {
      "aaasecurityfile12345.txt": "Contact: mailto:security@example.com",
      "zzznotakey000000.txt": "unrelated body",
      [`${KEY}.txt`]: `${KEY}\n`,
    },
    async (dir) => {
      assert.deepEqual(await readIndexNowKey(dir), { key: KEY, file: `${KEY}.txt` });
    },
  );
});

test("skips a shorter/longer name-body mismatch and returns null when none match", async () => {
  await withPublicDir(
    { "security.txt": "Contact: mailto:security@example.com" },
    async (dir) => {
      assert.equal(await readIndexNowKey(dir), null);
    },
  );
});

test("rejects names outside the IndexNow key shape", async () => {
  await withPublicDir(
    { "short.txt": "short", "k.txt": "k" },
    async (dir) => {
      assert.equal(await readIndexNowKey(dir), null);
    },
  );
});

test("a shape-matching file with non-key content is skipped, real key still wins", async () => {
  await withPublicDir(
    {
      "googledemo1234abcd.txt": "google-site-verification: googledemo1234abcd",
      [`${KEY}.txt`]: KEY,
    },
    async (dir) => {
      assert.deepEqual(await readIndexNowKey(dir), { key: KEY, file: `${KEY}.txt` });
    },
  );
});
