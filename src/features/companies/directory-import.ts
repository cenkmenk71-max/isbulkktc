import {
  deduplicateCompanyDirectory,
  type CompanyDirectoryEntry,
} from "./directory";

// Approximate coordinate coverage to discard map-search spillover, not an official border.
const greekScript = /[\u0370-\u03FF\u1F00-\u1FFF]/u;
const northernCyprusCoverage: readonly (readonly [number, number])[] = [
  [32.6, 35.1],
  [32.72, 35.1],
  [32.9, 35.13],
  [33.05, 35.15],
  [33.2, 35.17],
  [33.33, 35.17],
  [33.45, 35.14],
  [33.65, 35.13],
  [33.9, 35.11],
  [34.05, 35.12],
  [34.2, 35.15],
  [34.38, 35.19],
  [34.53, 35.25],
  [34.68, 35.34],
  [34.68, 35.75],
  [32.6, 35.75],
];

export function isWithinNorthernCyprusCoverage(
  longitude: number,
  latitude: number,
): boolean {
  let inside = false;
  let previous = northernCyprusCoverage.length - 1;

  for (
    let current = 0;
    current < northernCyprusCoverage.length;
    previous = current, current += 1
  ) {
    const [currentLongitude, currentLatitude] =
      northernCyprusCoverage[current];
    const [previousLongitude, previousLatitude] =
      northernCyprusCoverage[previous];

    if (
      (currentLatitude > latitude) !== (previousLatitude > latitude) &&
      longitude <
        ((previousLongitude - currentLongitude) *
          (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude
    ) {
      inside = !inside;
    }
  }

  return inside;
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);

  const headers = rows.shift()?.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  if (!headers?.length) throw new Error("CSV file has no header row.");
  if (new Set(headers).size !== headers.length) {
    throw new Error("CSV file contains duplicate column names.");
  }

  return rows.map((values, index) => {
    if (values.length > headers.length) {
      throw new Error(`CSV row ${index + 2} has more values than its header.`);
    }

    return Object.fromEntries(
      headers.map((header, columnIndex) => [
        header,
        values[columnIndex]?.trim() ?? "",
      ]),
    );
  });
}

function safeWebsite(value: string, rowNumber: number): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CSV row ${rowNumber} has an invalid website URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`CSV row ${rowNumber} has a non-web website URL.`);
  }
  return url.toString();
}

function splitCategories(value: string): string[] {
  return [...new Set(value.split(",").map((category) => category.trim()).filter(Boolean))];
}

export function companyEntriesFromCsv(
  text: string,
): {
  entries: CompanyDirectoryEntry[];
  outOfRegionRecordCount: number;
  greekNameRecordCount: number;
} {
  const records = parseCsvRecords(text);
  const headers = new Set(records.length ? Object.keys(records[0]) : []);
  for (const required of ["place_id", "title", "latitude", "longitude"]) {
    if (!headers.has(required)) {
      throw new Error(`CSV is missing the required "${required}" column.`);
    }
  }

  const entries: CompanyDirectoryEntry[] = [];
  let outOfRegionRecordCount = 0;
  let greekNameRecordCount = 0;

  records.forEach((record, index) => {
    const field = (name: string) => record[name]?.trim() ?? "";
    const name = field("title");
    if (!name) throw new Error(`CSV row ${index + 2} has no company name.`);
    const id = field("place_id");
    if (!id) throw new Error(`CSV row ${index + 2} has no place_id.`);
    const latitude = Number(field("latitude"));
    const longitude = Number(field("longitude"));
    if (
      !field("latitude") ||
      !field("longitude") ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`CSV row ${index + 2} has invalid coordinates.`);
    }
    if (!isWithinNorthernCyprusCoverage(longitude, latitude)) {
      outOfRegionRecordCount += 1;
      return;
    }
    if (greekScript.test(name)) {
      greekNameRecordCount += 1;
      return;
    }

    entries.push({
      id,
      name,
      categories: splitCategories(field("categories")),
      locations: [
        {
          address: field("address") || null,
          municipality: field("municipality") || null,
          phone: field("phone") || null,
          website: safeWebsite(field("website"), index + 2),
        },
      ],
    });
  });

  return { entries, outOfRegionRecordCount, greekNameRecordCount };
}

export function importCompanyDirectory(
  csvFiles: readonly string[],
): {
  entries: CompanyDirectoryEntry[];
  sourceRecordCount: number;
  outOfRegionRecordCount: number;
  greekNameRecordCount: number;
} {
  const results = csvFiles.map(companyEntriesFromCsv);
  const imported = results.flatMap((result) => result.entries);
  return {
    entries: deduplicateCompanyDirectory(imported),
    sourceRecordCount: results.reduce(
      (total, result) =>
        total +
        result.entries.length +
        result.outOfRegionRecordCount +
        result.greekNameRecordCount,
      0,
    ),
    outOfRegionRecordCount: results.reduce(
      (total, result) => total + result.outOfRegionRecordCount,
      0,
    ),
    greekNameRecordCount: results.reduce(
      (total, result) => total + result.greekNameRecordCount,
      0,
    ),
  };
}
