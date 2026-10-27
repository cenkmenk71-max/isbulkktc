import "server-only";
import companyLogosManifest from "./data/company-logos.json";
import type { CompanyDirectoryEntry } from "./directory";

type CompanyLogoRecord = {
  file: string;
  domain: string;
  width?: number;
  height?: number;
};

const logoRecords = (companyLogosManifest.logos ?? {}) as Record<
  string,
  CompanyLogoRecord
>;

/**
 * Deduplicated directory entries keep the id of their first occurrence, while the
 * collected logo may belong to a merged duplicate. Matching on the website domain
 * as well keeps those logos attached.
 */
const logoByDomain = new Map<string, CompanyLogoRecord>();

for (const record of Object.values(logoRecords)) {
  if (record?.domain && record?.file && !logoByDomain.has(record.domain)) {
    logoByDomain.set(record.domain, record);
  }
}

function aspectOf(record: CompanyLogoRecord | undefined): number | null {
  if (!record?.width || !record?.height) return null;
  return record.width / record.height;
}

function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;

  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function getCompanyLogoFile(companyId: string): string | null {
  return logoRecords[companyId]?.file ?? null;
}

export function withCompanyLogos(
  entries: readonly CompanyDirectoryEntry[],
): CompanyDirectoryEntry[] {
  return entries.map((entry) => {
    const direct = logoRecords[entry.id];
    const byDomain = entry.locations
      .map((location) => {
        const domain = domainOf(location.website);
        return domain ? (logoByDomain.get(domain) ?? null) : null;
      })
      .find((record): record is CompanyLogoRecord => Boolean(record?.file));

    const record = direct ?? byDomain;
    if (!record?.file) return entry;

    return {
      ...entry,
      logo: record.file,
      logoAspect: aspectOf(record),
    };
  });
}
