import {
  getNorthernCyprusDistrictForLocation,
  resolveNorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";

export type CompanyDirectoryLocation = {
  address: string | null;
  municipality: string | null;
  phone: string | null;
  website: string | null;
  email?: string | null;
};

export type CompanyDirectoryEntry = {
  id: string;
  name: string;
  categories: string[];
  locations: CompanyDirectoryLocation[];
  description?: string | null;
  logo?: string | null;
  /** Natural width / height of `logo`, used to pick the right tile shape. */
  logoAspect?: number | null;
};

export type CompanyDirectoryContact = {
  kind: "phone" | "email";
  label: string;
  href: string | null;
};

export type CompanyDirectoryOverride = {
  directory_entry_id: string;
  directory_location_index: number;
  company_name: string;
  profile_description: string;
  categories: string[];
  website: string | null;
  phone: string | null;
  public_email: string | null;
  address: string | null;
  municipality: string | null;
};

export function getCompanyDirectoryContacts(
  location: Pick<CompanyDirectoryLocation, "phone" | "email">,
): CompanyDirectoryContact[] {
  const contacts: CompanyDirectoryContact[] = [];
  if (location.phone) {
    const phoneNumber = location.phone.replace(/[^\d+]/g, "");
    contacts.push({
      kind: "phone",
      label: location.phone,
      href: phoneNumber ? `tel:${phoneNumber}` : null,
    });
  }
  if (location.email) {
    contacts.push({
      kind: "email",
      label: location.email,
      href: `mailto:${location.email}`,
    });
  }
  return contacts;
}

export function applyCompanyDirectoryOverrides(
  entries: readonly CompanyDirectoryEntry[],
  overrides: readonly CompanyDirectoryOverride[],
): CompanyDirectoryEntry[] {
  const overridesByEntry = new Map<string, CompanyDirectoryOverride[]>();
  for (const override of overrides) {
    const current = overridesByEntry.get(override.directory_entry_id) ?? [];
    current.push(override);
    overridesByEntry.set(override.directory_entry_id, current);
  }

  return entries.map((entry) => {
    let updated = entry;
    for (const override of overridesByEntry.get(entry.id) ?? []) {
      if (!updated.locations[override.directory_location_index]) continue;

      updated = {
        ...updated,
        name: override.company_name,
        description: override.profile_description || null,
        categories: [...override.categories],
        locations: updated.locations.map((location, index) =>
          index === override.directory_location_index
            ? {
                address: override.address,
                municipality: override.municipality,
                phone: override.phone,
                website: override.website,
                email: override.public_email,
              }
            : location,
        ),
      };
    }

    return updated;
  });
}

export function normalizeCompanySearchText(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameLocation(
  current: CompanyDirectoryLocation,
  incoming: CompanyDirectoryLocation,
): boolean {
  const currentAddress = normalizeCompanySearchText(current.address ?? "");
  const incomingAddress = normalizeCompanySearchText(incoming.address ?? "");

  if (currentAddress && incomingAddress) {
    return currentAddress === incomingAddress;
  }

  const currentPhone = current.phone?.replace(/\D/g, "");
  const incomingPhone = incoming.phone?.replace(/\D/g, "");
  const currentWebsite = current.website
    ? new URL(current.website).hostname.replace(/^www\./, "").toLowerCase()
    : "";
  const incomingWebsite = incoming.website
    ? new URL(incoming.website).hostname.replace(/^www\./, "").toLowerCase()
    : "";

  return Boolean(
    (currentPhone && currentPhone === incomingPhone) ||
    (currentWebsite && currentWebsite === incomingWebsite) ||
    (!currentAddress &&
      !incomingAddress &&
      !current.phone &&
      !incoming.phone &&
      !current.website &&
      !incoming.website),
  );
}

function mergeLocations(
  current: readonly CompanyDirectoryLocation[],
  incoming: readonly CompanyDirectoryLocation[],
): CompanyDirectoryLocation[] {
  const locations = current.map((location) => ({ ...location }));

  for (const location of incoming) {
    const existingIndex = locations.findIndex((candidate) =>
      sameLocation(candidate, location),
    );

    if (existingIndex === -1) {
      locations.push({ ...location });
      continue;
    }

    locations[existingIndex] = {
      ...locations[existingIndex],
      address: locations[existingIndex].address || location.address,
      municipality:
        locations[existingIndex].municipality || location.municipality,
      phone: locations[existingIndex].phone || location.phone,
      website: locations[existingIndex].website || location.website,
    };
  }

  return locations;
}

function getCompanyIdentityKeys(entry: CompanyDirectoryEntry): string[] {
  const name = normalizeCompanySearchText(entry.name);
  const keys = new Set<string>();

  for (const location of entry.locations) {
    if (location.website) {
      const domain = new URL(location.website).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      keys.add(`${name}|website:${domain}`);
    }

    const phone = location.phone?.replace(/\D/g, "");
    if (phone) keys.add(`${name}|phone:${phone}`);

    const district = getNorthernCyprusDistrictForLocation(location);
    if (district) keys.add(`${name}|district:${district}`);
  }

  return [...keys];
}

function profileRichness(entry: CompanyDirectoryEntry): number {
  return entry.locations.reduce(
    (score, location) =>
      score +
      (location.address ? 1 : 0) +
      (location.phone ? 1 : 0) +
      (location.website ? 1 : 0),
    0,
  );
}

function mergeEntries(
  current: CompanyDirectoryEntry,
  incoming: CompanyDirectoryEntry,
): CompanyDirectoryEntry {
  const categories = new Map(
    current.categories.map((category) => [
      normalizeCompanySearchText(category),
      category,
    ]),
  );

  for (const category of incoming.categories) {
    const key = normalizeCompanySearchText(category);
    if (!categories.has(key)) categories.set(key, category);
  }

  const preferred =
    profileRichness(incoming) > profileRichness(current) ? incoming : current;

  return {
    ...current,
    name: preferred.name,
    categories: [...categories.values()],
    locations: mergeLocations(current.locations, incoming.locations),
  };
}

export function deduplicateCompanyDirectory(
  entries: readonly CompanyDirectoryEntry[],
): CompanyDirectoryEntry[] {
  const unique: CompanyDirectoryEntry[] = [];
  const byId = new Map<string, number>();
  const byLocation = new Map<string, number>();
  const byCompanyIdentity = new Map<string, number>();

  for (const entry of entries) {
    const normalizedName = normalizeCompanySearchText(entry.name);
    const locationKeys = entry.locations.flatMap((location) => {
      const normalizedAddress = location.address
        ? normalizeCompanySearchText(location.address)
        : "";
      return normalizedName && normalizedAddress
        ? [`${normalizedName}|${normalizedAddress}`]
        : [];
    });
    const identityKeys = getCompanyIdentityKeys(entry);
    const existingIndex =
      byId.get(entry.id) ??
      locationKeys
        .map((key) => byLocation.get(key))
        .find((index) => index !== undefined) ??
      identityKeys
        .map((key) => byCompanyIdentity.get(key))
        .find((index) => index !== undefined);

    if (existingIndex !== undefined) {
      unique[existingIndex] = mergeEntries(unique[existingIndex], entry);
      byId.set(entry.id, existingIndex);
      for (const locationKey of locationKeys) {
        byLocation.set(locationKey, existingIndex);
      }
      for (const identityKey of identityKeys) {
        byCompanyIdentity.set(identityKey, existingIndex);
      }
      for (const identityKey of getCompanyIdentityKeys(unique[existingIndex])) {
        byCompanyIdentity.set(identityKey, existingIndex);
      }
      continue;
    }

    const index =
      unique.push({
        ...entry,
        categories: [...entry.categories],
        locations: entry.locations.map((location) => ({ ...location })),
      }) - 1;
    byId.set(entry.id, index);
    for (const locationKey of locationKeys) {
      byLocation.set(locationKey, index);
    }
    for (const identityKey of identityKeys) {
      byCompanyIdentity.set(identityKey, index);
    }
  }

  return unique;
}

export function searchCompanyDirectory(
  entries: readonly CompanyDirectoryEntry[],
  {
    query,
    category,
    location,
  }: {
    query: string;
    category?: string;
    location?: string;
  },
): CompanyDirectoryEntry[] {
  const normalizedCategory = normalizeCompanySearchText(category ?? "");
  const selectedDistrict = location
    ? resolveNorthernCyprusDistrict(location)
    : null;

  if (location && !selectedDistrict) return [];

  return entries.flatMap((entry) => {
    if (
      normalizedCategory &&
      !entry.categories.some(
        (value) => normalizeCompanySearchText(value) === normalizedCategory,
      )
    ) {
      return [];
    }

    const locations = selectedDistrict
      ? entry.locations.filter(
          (entryLocation) =>
            getNorthernCyprusDistrictForLocation(entryLocation) ===
            selectedDistrict,
        )
      : entry.locations;
    if (selectedDistrict && locations.length === 0) return [];

    return companyDirectoryMatchScore(entry.name, query) >= 0
      ? [{ ...entry, locations }]
      : [];
  });
}

// Scores a company name against the query for both filtering and ordering.
// Every whitespace-separated query token must appear somewhere in the name
// (so "ada market" matches "Ada Market Ltd."), and the score is the sum of the
// earliest match offsets: the smaller the score, the earlier the name matches,
// which floats prefix hits ("Ada…") above names that merely contain the token.
export function companyDirectoryMatchScore(name: string, query: string): number {
  const normalizedName = normalizeCompanySearchText(name);
  const tokens = normalizeCompanySearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    const index = normalizedName.indexOf(token);
    if (index === -1) return -1;
    score += index;
  }
  return score;
}

export function sortCompanyDirectory(
  entries: readonly CompanyDirectoryEntry[],
  direction: "ascending" | "descending" = "ascending",
  query = "",
): CompanyDirectoryEntry[] {
  const collator = new Intl.Collator("tr", {
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true,
  });
  const multiplier = direction === "ascending" ? 1 : -1;
  const normalizedQuery = normalizeCompanySearchText(query);

  return [...entries].sort((left, right) => {
    // While searching, names that match earliest (prefix hits) come first; the
    // selected A-Z / Z-A direction stays meaningful as the tie-breaker.
    if (normalizedQuery) {
      const scoreDifference =
        companyDirectoryMatchScore(left.name, normalizedQuery) -
        companyDirectoryMatchScore(right.name, normalizedQuery);
      if (scoreDifference !== 0) return scoreDifference;
    }
    return multiplier * collator.compare(left.name, right.name);
  });
}
