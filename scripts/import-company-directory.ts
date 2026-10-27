import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importCompanyDirectory } from "../src/features/companies/directory-import";

const sourceDirectory = process.argv[2];
if (!sourceDirectory) {
  throw new Error(
    'Usage: npm run import:company-directory -- "C:\\path\\to\\csv-folder"',
  );
}

const sourcePath = resolve(sourceDirectory);
const csvNames = (await readdir(sourcePath))
  .filter((name) => name.toLocaleLowerCase("en").endsWith(".csv"))
  .sort((left, right) => left.localeCompare(right));

if (csvNames.length === 0) {
  throw new Error(`No CSV files found in ${sourcePath}.`);
}

const csvFiles = await Promise.all(
  csvNames.map((name) => readFile(resolve(sourcePath, name), "utf8")),
);
const {
  entries,
  sourceRecordCount,
  outOfRegionRecordCount,
  greekNameRecordCount,
} = importCompanyDirectory(csvFiles);
const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
entries.sort((left, right) => collator.compare(left.name, right.name));

const outputPath = fileURLToPath(
  new URL("../src/features/companies/data/company-directory.json", import.meta.url),
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

console.info(
  `Imported ${sourceRecordCount} rows from ${csvNames.length} CSV files; ` +
    `excluded ${outOfRegionRecordCount} outside the approximate Northern Cyprus coverage, ` +
      `excluded ${greekNameRecordCount} Greek-script company names, ` +
      `kept ${entries.length} unique companies and merged ` +
      `${sourceRecordCount - outOfRegionRecordCount - greekNameRecordCount - entries.length} repeated listings into ` +
    `${relative(process.cwd(), outputPath)}.`,
);
