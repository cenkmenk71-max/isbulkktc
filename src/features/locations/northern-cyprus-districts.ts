export const northernCyprusDistrictValues = [
  "Lefkoşa",
  "Mağusa",
  "Girne",
  "Güzelyurt",
  "İskele",
  "Lefke",
] as const;

export type NorthernCyprusDistrict =
  (typeof northernCyprusDistrictValues)[number];

export const northernCyprusDistricts = [
  { value: "Lefkoşa", key: "lefkosia" },
  { value: "Mağusa", key: "magusa" },
  { value: "Girne", key: "girne" },
  { value: "Güzelyurt", key: "guzelyurt" },
  { value: "İskele", key: "iskele" },
  { value: "Lefke", key: "lefke" },
] as const satisfies readonly {
  value: NorthernCyprusDistrict;
  key: string;
}[];

function normalizeLocation(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const districtAliases: Record<NorthernCyprusDistrict, readonly string[]> = {
  Lefkoşa: ["lefkosa", "lefkosia", "nicosia", "lefkosa turk belediyesi"],
  Mağusa: ["magusa", "gazimagusa", "famagusta", "ammochostos"],
  Girne: ["girne", "kyrenia", "keryneia"],
  Güzelyurt: ["guzelyurt", "morphou", "morfou", "omorfo"],
  İskele: ["iskele", "trikomo"],
  Lefke: ["lefke", "lefka"],
};

const localityDistricts: Record<string, NorthernCyprusDistrict> = {
  "kucuk kaymakli": "Lefkoşa",
  kaimakli: "Lefkoşa",
  taskinkoy: "Lefkoşa",
  yenikent: "Lefkoşa",
  koskluciftlik: "Lefkoşa",
  sakarya: "Lefkoşa",
  kumsal: "Lefkoşa",
  surici: "Lefkoşa",
  yenicami: "Lefkoşa",
  gonyeli: "Lefkoşa",
  hamitkoy: "Lefkoşa",
  haspolat: "Lefkoşa",
  alaykoy: "Lefkoşa",
  metehan: "Lefkoşa",
  kermiya: "Lefkoşa",
  degirmenlik: "Lefkoşa",
  kizilbas: "Lefkoşa",
  "ortakoy lefkosa": "Lefkoşa",
  dikmen: "Lefkoşa",
  "τρυπιωτη": "Lefkoşa",
  "αγιος αντωνιος": "Lefkoşa",
  "ayios andreas": "Lefkoşa",
  "gelibolu": "Mağusa",
  "namik kemal": "Mağusa",
  baykal: "Mağusa",
  canbulat: "Mağusa",
  denizli: "Mağusa",
  dumlupinar: "Mağusa",
  karakol: "Mağusa",
  canakkale: "Mağusa",
  guzelyali: "Girne",
  karavas: "Girne",
  karaman: "Girne",
  lapta: "Girne",
  alsancak: "Girne",
  karsiyaka: "Girne",
  catalkoy: "Girne",
  dogankoy: "Girne",
  karaoglanoglu: "Girne",
  zeytinlik: "Girne",
  bellapais: "Girne",
  ozankoy: "Girne",
  esentepe: "Girne",
  karakum: "Girne",
  beylerbeyi: "Girne",
  akcay: "Güzelyurt",
  kalkanli: "Güzelyurt",
  serhatkoy: "Güzelyurt",
  yayla: "Güzelyurt",
  mehmetcik: "İskele",
  buyukkonuk: "İskele",
  yenierenkoy: "İskele",
  dipkarpaz: "İskele",
  bafra: "İskele",
  kaleburnu: "İskele",
  topcukoy: "İskele",
  cayirova: "İskele",
  yedidalga: "Lefke",
  yesilirmak: "Lefke",
  gemikonagi: "Lefke",
  camlikoy: "Lefke",
  baglikoy: "Lefke",
};

const addressLocalities: Record<string, NorthernCyprusDistrict> = {
  gonyeli: "Lefkoşa",
  hamitkoy: "Lefkoşa",
  haspolat: "Lefkoşa",
  alaykoy: "Lefkoşa",
  metehan: "Lefkoşa",
  kermiya: "Lefkoşa",
  degirmenlik: "Lefkoşa",
  dikmen: "Lefkoşa",
  yenibogazici: "Mağusa",
  "yeni bogazici": "Mağusa",
  tuzla: "Mağusa",
  akdogan: "Mağusa",
  alsancak: "Girne",
  lapta: "Girne",
  karsiyaka: "Girne",
  catalkoy: "Girne",
  dogankoy: "Girne",
  karaoglanoglu: "Girne",
  zeytinlik: "Girne",
  bellapais: "Girne",
  ozankoy: "Girne",
  esentepe: "Girne",
  karakum: "Girne",
  beylerbeyi: "Girne",
  karavas: "Girne",
  karaman: "Girne",
  akcay: "Güzelyurt",
  kalkanli: "Güzelyurt",
  serhatkoy: "Güzelyurt",
  yayla: "Güzelyurt",
  mehmetcik: "İskele",
  buyukkonuk: "İskele",
  yenierenkoy: "İskele",
  dipkarpaz: "İskele",
  bafra: "İskele",
  kaleburnu: "İskele",
  topcukoy: "İskele",
  cayirova: "İskele",
  yedidalga: "Lefke",
  yesilirmak: "Lefke",
  gemikonagi: "Lefke",
  camlikoy: "Lefke",
  baglikoy: "Lefke",
};

const normalizedAddressLocalities = new Map(
  Object.entries(addressLocalities).map(([locality, district]) => [
    normalizeLocation(locality),
    district,
  ]),
);

const normalizedDistrictAliases = new Map<string, NorthernCyprusDistrict>();
for (const [district, aliases] of Object.entries(districtAliases) as [
  NorthernCyprusDistrict,
  readonly string[],
][]) {
  for (const alias of aliases) {
    normalizedDistrictAliases.set(normalizeLocation(alias), district);
  }
}

const normalizedLocalityDistricts = new Map(
  Object.entries(localityDistricts).map(([locality, district]) => [
    normalizeLocation(locality),
    district,
  ]),
);

function findDistrictMentions(
  value: string,
  aliases: ReadonlyMap<string, NorthernCyprusDistrict>,
): Set<NorthernCyprusDistrict> {
  const normalized = normalizeLocation(value);
  const words = ` ${normalized} `;
  const matches = new Set<NorthernCyprusDistrict>();

  for (const [alias, district] of aliases) {
    if (words.includes(` ${alias} `)) matches.add(district);
  }

  return matches;
}

export function resolveNorthernCyprusDistrict(
  value: string | null | undefined,
): NorthernCyprusDistrict | null {
  if (!value?.trim()) return null;

  const normalized = normalizeLocation(value);
  const direct = normalizedDistrictAliases.get(normalized);
  if (direct) return direct;

  const locality = normalizedLocalityDistricts.get(normalized);
  if (locality) return locality;

  const mentions = findDistrictMentions(value, normalizedDistrictAliases);
  return mentions.size === 1 ? [...mentions][0] : null;
}

export function getNorthernCyprusDistrictForLocation(location: {
  address?: string | null;
  municipality?: string | null;
}): NorthernCyprusDistrict | null {
  const addressDistricts = new Set<NorthernCyprusDistrict>();

  if (location.address) {
    const addressSegments = location.address
      .split(/[,;|]/)
      .map(normalizeLocation);

    for (const segment of addressSegments) {
      for (const [alias, district] of normalizedDistrictAliases) {
        if (new RegExp(`(?:^| )${alias}(?: [0-9]{4,5})?$`).test(segment)) {
          addressDistricts.add(district);
        }
      }
      for (const [locality, district] of normalizedAddressLocalities) {
        if (
          new RegExp(`(?:^| )${locality}(?: [0-9]{4,5})?$`).test(segment)
        ) {
          addressDistricts.add(district);
        }
      }
    }

    const normalizedAddress = normalizeLocation(location.address);
    const postcodeAliases = new Map([
      ...normalizedDistrictAliases,
      ...normalizedAddressLocalities,
    ]);
    for (const [alias, district] of postcodeAliases) {
      const withPostalCode = new RegExp(
        `(?:^| )${alias} [0-9]{4,5}(?: |$)`,
      );
      if (withPostalCode.test(normalizedAddress)) {
        addressDistricts.add(district);
      }
    }
  }

  if (addressDistricts.size > 1) return null;
  if (addressDistricts.size === 1) return [...addressDistricts][0];

  const candidates = new Set<NorthernCyprusDistrict>();

  if (location.municipality) {
    const municipality = resolveNorthernCyprusDistrict(location.municipality);
    if (municipality) candidates.add(municipality);

    const municipalityLocality = normalizedLocalityDistricts.get(
      normalizeLocation(location.municipality),
    );
    if (municipalityLocality) candidates.add(municipalityLocality);
  }

  if (location.address) {
    const normalizedAddress = normalizeLocation(location.address);
    for (const [locality, district] of normalizedAddressLocalities) {
      if (` ${normalizedAddress} `.includes(` ${locality} `)) {
        candidates.add(district);
      }
    }
  }

  return candidates.size === 1 ? [...candidates][0] : null;
}
