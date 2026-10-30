import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  packageTierColors,
  packageTierPlanCodes,
  type PackageTierId,
} from "../src/components/packages/package-tiers";

/**
 * Turns the bundled content (legal copy, FAQ, listing-plan prices, the company
 * directory) into `supabase/seed-managed-content.sql`.
 *
 * The bundles stay the *source* for local development and CI: this script is
 * what moves them into the tables so the same code paths the administrators use
 * are exercised end to end. It never runs against a remote database — the output
 * is a plain SQL file that `supabase db reset` applies with the other seeds.
 *
 * The seed is deterministic and idempotent: it clears the four managed tables
 * and re-inserts them inside one transaction, so re-running it is safe and the
 * local stack always converges on the bundled content.
 */

const LOCALES = ["tr", "en", "ru", "el", "fa", "de"] as const;
type Locale = (typeof LOCALES)[number];

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlTextArray(values: readonly string[]): string {
  if (values.length === 0) return "'{}'";
  return `array[${values.map(sqlText).join(", ")}]`;
}

function sqlNullableText(value: string | null | undefined): string {
  return value ? sqlText(value) : "null";
}

type LegalSection = { title: string; paragraphs: string[] };
type LegalDocument = {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
};

function parseLegalDocument(
  page: { title: string; intro: string; updated: string; sections: Record<string, Record<string, string>> },
): LegalDocument {
  const sections = Object.keys(page.sections)
    .sort((left, right) =>
      left.localeCompare(right, "en", { numeric: true }),
    )
    .map((key) => {
      const section = page.sections[key];
      const paragraphs = Object.keys(section)
        .filter((field) => /^p\d+$/.test(field))
        .sort((left, right) =>
          left.localeCompare(right, "en", { numeric: true }),
        )
        .map((field) => section[field]);
      return { title: section.title, paragraphs };
    });

  return {
    title: page.title,
    intro: page.intro,
    updated: page.updated,
    sections,
  };
}

type Messages = {
  Legal: Record<
    string,
    { title: string; intro: string; updated: string; sections: Record<string, Record<string, string>> }
  >;
  PackagesPage: {
    showcase: {
      cards: Record<string, { title: string; audience: string; summary: string }>;
      terms: Record<string, string>;
    };
  };
};

async function readMessages(locale: Locale): Promise<Messages> {
  const raw = await readFile(
    fileURLToPath(new URL(`../src/messages/${locale}.json`, import.meta.url)),
    "utf8",
  );
  return JSON.parse(raw) as Messages;
}

const statements: string[] = [];

// Managed tables, cleared in dependency order. `site_content` and `faq_entries`
// carry no foreign keys, so the order only matters for the directory pair.
statements.push(
  "delete from public.directory_locations;",
  "delete from public.directory_companies;",
  "delete from public.faq_entries;",
  "delete from public.site_content;",
  "delete from public.listing_plans;",
);

// Legal documents ----------------------------------------------------------

let legalCount = 0;
for (const locale of LOCALES) {
  const messages = await readMessages(locale);
  const legal = messages.Legal;
  for (const page of ["privacy", "cookies", "terms"] as const) {
    const document = parseLegalDocument(legal[page]);
    statements.push(
      `insert into public.site_content (content_key, locale, document) values (` +
        `${sqlText(`legal.${page}`)}, ${sqlText(locale)}, ` +
        `${sqlText(JSON.stringify(document))}::jsonb);`,
    );
    legalCount += 1;
  }
}

// FAQ ----------------------------------------------------------------------

const faqSource = await readFile(
  fileURLToPath(new URL("../src/content/ai-visibility/faq.ts", import.meta.url)),
  "utf8",
);
const faqByLocale = parseFaqSource(faqSource);

let faqCount = 0;
for (const locale of LOCALES) {
  faqByLocale[locale].forEach((entry, index) => {
    statements.push(
      `insert into public.faq_entries (locale, question, answer, sort_order, is_published) values (` +
        `${sqlText(locale)}, ${sqlText(entry.question)}, ${sqlText(entry.answer)}, ` +
        `${index}, true);`,
    );
    faqCount += 1;
  });
}

// Listing plans ------------------------------------------------------------

const planRows = await buildPlanRows();
for (const row of planRows) {
  statements.push(
    `insert into public.listing_plans (` +
      `code, audience, name, blurb, features, color, listing_count, ` +
      `price_1, price_7, price_30, is_active, sort_order) values (` +
      [
        sqlText(row.code),
        sqlText(row.audience),
        sqlText(row.name),
        sqlText(row.blurb),
        sqlTextArray(row.features),
        sqlText(row.color),
        row.listingCount === null ? "null" : String(row.listingCount),
        String(row.price1),
        String(row.price7),
        String(row.price30),
        "true",
        String(row.sortOrder),
      ].join(", ") +
      ");",
  );
}

// Company directory --------------------------------------------------------

const directoryRaw = await readFile(
  fileURLToPath(
    new URL(
      "../src/features/companies/data/company-directory.json",
      import.meta.url,
    ),
  ),
  "utf8",
);
const logoManifest = JSON.parse(
  await readFile(
    fileURLToPath(
      new URL(
        "../src/features/companies/data/company-logos.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as {
  logos: Record<
    string,
    { file: string; domain: string; width?: number; height?: number }
  >;
};

const directory = JSON.parse(directoryRaw) as {
  id: string;
  name: string;
  categories: string[];
  locations: {
    address: string | null;
    municipality: string | null;
    phone: string | null;
    website?: string | null;
    email?: string | null;
  }[];
}[];

const logoRecords = logoManifest.logos ?? {};
const logoByDomain = new Map<string, { file: string; width?: number; height?: number }>();
for (const record of Object.values(logoRecords)) {
  if (record?.domain && record?.file && !logoByDomain.has(record.domain)) {
    logoByDomain.set(record.domain, record);
  }
}

function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

let locationCount = 0;
for (const entry of directory) {
  const direct = logoRecords[entry.id];
  const byDomain = entry.locations
    .map((location) => domainOf(location.website))
    .map((domain) => (domain ? logoByDomain.get(domain) : undefined))
    .find((record) => Boolean(record?.file));
  const logo = direct ?? byDomain;

  statements.push(
    `insert into public.directory_companies (` +
      `directory_entry_id, name, categories, logo_file, logo_domain, logo_width, logo_height) values (` +
      [
        sqlText(entry.id),
        sqlText(entry.name),
        sqlTextArray(entry.categories),
        sqlNullableText(logo?.file),
        sqlNullableText(logo?.domain),
        logo?.width ? String(logo.width) : "null",
        logo?.height ? String(logo.height) : "null",
      ].join(", ") +
      ");",
  );

  entry.locations.forEach((location, index) => {
    statements.push(
      `insert into public.directory_locations (` +
        `directory_entry_id, location_index, address, municipality, phone, website, email) values (` +
        [
          sqlText(entry.id),
          String(index),
          sqlNullableText(location.address),
          sqlNullableText(location.municipality),
          sqlNullableText(location.phone),
          sqlNullableText(location.website),
          sqlNullableText(location.email),
        ].join(", ") +
        ");",
    );
    locationCount += 1;
  });
}

const header = [
  "-- Generated by scripts/generate-managed-content-seed.ts.",
  "-- Deterministic managed-content fixtures (legal copy, FAQ, listing plans and",
  "-- the company directory) for local Supabase and CI. Do not edit by hand; run",
  "-- `npm run seed:managed-content` to refresh from the bundled content.",
  "begin;",
  "",
].join("\n");

const footer = [
  "",
  "commit;",
  "",
].join("\n");

const outputPath = fileURLToPath(
  new URL("../supabase/seed-managed-content.sql", import.meta.url),
);
await writeFile(outputPath, `${header}${statements.join("\n")}\n${footer}`, "utf8");

console.info(
  `Wrote ${statements.length} statements to supabase/seed-managed-content.sql ` +
    `(${legalCount} legal documents, ${faqCount} FAQ entries, ${planRows.length} listing plans, ` +
    `${directory.length} directory companies, ${locationCount} branches).`,
);

// ---------------------------------------------------------------------------

/** Extracts the FAQ catalogue from its TypeScript module. */
function parseFaqSource(source: string): Record<Locale, { question: string; answer: string }[]> {
  const result = {} as Record<Locale, { question: string; answer: string }[]>;
  for (const locale of LOCALES) {
    const block = extractLocaleArray(source, locale);
    result[locale] = block;
  }
  return result;
}

function extractLocaleArray(
  source: string,
  locale: Locale,
): { question: string; answer: string }[] {
  const marker = `\n  ${locale}: [`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`FAQ locale ${locale} not found.`);
  const bodyStart = start + marker.length;

  // Walk to the matching `]` of the array, ignoring brackets inside strings.
  let depth = 1;
  let index = bodyStart;
  let inString: string | null = null;
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === inString) inString = null;
    } else if (char === '"' || char === "'" || char === "`") {
      inString = char;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
    index += 1;
  }

  const body = source.slice(bodyStart, index);
  const entries: { question: string; answer: string }[] = [];
  const entryPattern =
    /question:\s*([\s\S]*?),\s*\n\s*answer:\s*([\s\S]*?),\s*\n\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(body)) !== null) {
    entries.push({
      question: parseTsString(match[1]),
      answer: parseTsString(match[2]),
    });
  }
  if (entries.length === 0) {
    throw new Error(`FAQ locale ${locale} produced no entries.`);
  }
  return entries;
}

/** Reads a TypeScript string literal (single or double quoted). */
function parseTsString(literal: string): string {
  const trimmed = literal.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'") {
    throw new Error(`Unsupported FAQ literal: ${trimmed.slice(0, 40)}`);
  }
  const end = trimmed.lastIndexOf(quote);
  const inner = trimmed.slice(1, end);
  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

async function buildPlanRows() {
  const componentSource = await readFile(
    fileURLToPath(
      new URL(
        "../src/components/packages/packages-experience.tsx",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const tiers = parsePackageTiers(componentSource);

  const messages = await readMessages("tr");
  const showcase = messages.PackagesPage.showcase;

  return tiers.map((tier, index) => {
    const card = showcase.cards[tier.id];
    return {
      code: packageTierPlanCodes[tier.id],
      audience: card.audience,
      name: card.title,
      blurb: card.summary,
      features: tier.terms.map((term) => showcase.terms[term]),
      color: packageTierColors[tier.id],
      listingCount: tier.listingCount,
      price1: tier.prices?.[1] ?? 0,
      price7: tier.prices?.[7] ?? 0,
      price30: tier.prices?.[30] ?? 0,
      sortOrder: index + 1,
    };
  });
}

type ParsedTier = {
  id: PackageTierId;
  listingCount: number | null;
  prices: Record<1 | 7 | 30, number> | null;
  terms: string[];
};

/**
 * Reads the tier defaults straight out of `packages-experience.tsx`. The prices
 * the page renders and the prices the seed publishes are then the same numbers
 * by construction, so the fixture can never drift from the bundled fallback.
 * Only the values that live inline in the component are parsed; the colours and
 * plan codes come from the shared data module by import.
 */
function parsePackageTiers(source: string): ParsedTier[] {
  const tiers: ParsedTier[] = [];
  const tierPattern =
    /id:\s*"(\w+)",\s*\n\s*code:\s*packageTierPlanCodes\.(\w+),\s*\n\s*color:\s*packageTierColors\.(\w+),\s*\n\s*listingCount:\s*(null|\d+),\s*\n\s*prices:\s*(null|\{[^}]*\}),/g;

  let match: RegExpExecArray | null;
  while ((match = tierPattern.exec(source)) !== null) {
    const [, id, codeKey, colorKey, listingCountRaw, pricesRaw] = match;
    if (codeKey !== id || colorKey !== id) {
      throw new Error(`Tier ${id} uses mismatched code/colour keys.`);
    }
    tiers.push({
      id: id as PackageTierId,
      listingCount:
        listingCountRaw === "null" ? null : Number(listingCountRaw),
      prices: pricesRaw === "null" ? null : parsePrices(pricesRaw),
      terms: parseTierTerms(source, id),
    });
  }

  if (tiers.length === 0) {
    throw new Error(
      "No package tiers could be parsed from packages-experience.tsx.",
    );
  }
  return tiers;
}

function parsePrices(literal: string): Record<1 | 7 | 30, number> {
  const prices = {} as Record<1 | 7 | 30, number>;
  for (const [, day, amount] of literal.matchAll(/(\d+):\s*(\d+)/g)) {
    prices[Number(day) as 1 | 7 | 30] = Number(amount);
  }
  return prices;
}

function parseTierTerms(source: string, id: string): string[] {
  const match = source.match(new RegExp(`${id}:\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`Terms for tier ${id} not found.`);
  return [...match[1].matchAll(/"(\w+)"/g)].map((term) => term[1]);
}
