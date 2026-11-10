// Resolves the IndexNow key file in `public/`.
//
// IndexNow defines the key file as `<key>.txt` whose *body* equals `<key>`.
// Selecting by filename pattern alone (`entries.find(...)`) picks whatever the
// filesystem lists first, so any other matching `.txt` (e.g. `security.txt`,
// `ads.txt`, a `BingSiteAuth.txt`) silently hijacks the key and the submission
// is rejected without an error. Match the name against the body instead.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const KEY_FILE = /^([a-z0-9-]{8,128})\.txt$/i;

export async function readIndexNowKey(publicDir) {
  const entries = await readdir(publicDir);
  for (const name of entries.filter((entry) => KEY_FILE.test(entry))) {
    const key = (await readFile(path.join(publicDir, name), "utf8")).trim();
    if (key && key === name.replace(/\.txt$/i, "")) {
      return { key, file: name };
    }
  }
  return null;
}
