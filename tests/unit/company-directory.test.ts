import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCompanyDirectoryOverrides,
  deduplicateCompanyDirectory,
  getCompanyDirectoryContacts,
  normalizeCompanySearchText,
  searchCompanyDirectory,
  sortCompanyDirectory,
  type CompanyDirectoryEntry,
} from "../../src/features/companies/directory";
import {
  getNorthernCyprusDistrictForLocation,
  resolveNorthernCyprusDistrict,
} from "../../src/features/locations/northern-cyprus-districts";
import {
  companyEntriesFromCsv,
  importCompanyDirectory,
  isWithinNorthernCyprusCoverage,
  parseCsvRecords,
} from "../../src/features/companies/directory-import";

const sampleCompanies: CompanyDirectoryEntry[] = [
  {
    id: "company-a",
    name: "İnşaat & Tasarım Ltd.",
    categories: ["İnşaat Şirketi"],
    locations: [
      {
        address: "12 Girne Yolu",
        municipality: "Girne",
        phone: "+90 392 123 45 67",
        website: "https://example.test/",
      },
    ],
  },
  {
    id: "company-b",
    name: "Ada Eğitim Merkezi",
    categories: ["Eğitim Merkezi"],
    locations: [
      {
        address: "Lefkoşa merkez",
        municipality: "Lefkoşa",
        phone: null,
        website: null,
      },
    ],
  },
  {
    id: "company-c",
    name: "İnşaat & Tasarım Ltd.",
    categories: ["İnşaat Şirketi"],
    locations: [
      {
        address: "5 Mağusa yolu",
        municipality: "Gazimağusa",
        phone: null,
        website: null,
      },
    ],
  },
];

test("normalizes Turkish diacritics and dotless i for accent-insensitive search", () => {
  assert.equal(normalizeCompanySearchText("İnşaat ŞİRKETİ"), "insaat sirketi");
});

test("company directory renders email contact details independently from phone", () => {
  assert.deepEqual(
    getCompanyDirectoryContacts({
      phone: null,
      email: "contact@example.test",
    }),
    [
      {
        kind: "email",
        label: "contact@example.test",
        href: "mailto:contact@example.test",
      },
    ],
  );
  assert.deepEqual(
    getCompanyDirectoryContacts({
      phone: "+90 392 123 45 67",
      email: "contact@example.test",
    }),
    [
      {
        kind: "phone",
        label: "+90 392 123 45 67",
        href: "tel:+903921234567",
      },
      {
        kind: "email",
        label: "contact@example.test",
        href: "mailto:contact@example.test",
      },
    ],
  );
});

test("legacy Famagusta district names resolve to the single Mağusa label", () => {
  assert.equal(resolveNorthernCyprusDistrict("Mağusa"), "Mağusa");
  assert.equal(resolveNorthernCyprusDistrict("Gazimağusa"), "Mağusa");
  assert.equal(resolveNorthernCyprusDistrict("Famagusta"), "Mağusa");
});

test("approved company details replace only the claimed directory location", () => {
  const updated = applyCompanyDirectoryOverrides(sampleCompanies, [
    {
      directory_entry_id: "company-a",
      directory_location_index: 0,
      company_name: "İnşaat & Tasarım Ltd. Şti.",
      profile_description: "Updated company profile",
      categories: ["Architecture"],
      website: "https://updated.example.test",
      phone: "+90 555 000 11 22",
      public_email: "contact@example.test",
      address: "New address",
      municipality: "Lefkoşa",
    },
    {
      directory_entry_id: "unknown-entry",
      directory_location_index: 0,
      company_name: "Ignore invalid directory id",
      profile_description: "",
      categories: [],
      website: null,
      phone: null,
      public_email: null,
      address: null,
      municipality: null,
    },
  ]);

  assert.equal(updated[0]?.name, "İnşaat & Tasarım Ltd. Şti.");
  assert.equal(updated[0]?.description, "Updated company profile");
  assert.deepEqual(updated[0]?.categories, ["Architecture"]);
  assert.deepEqual(updated[0]?.locations[0], {
    address: "New address",
    municipality: "Lefkoşa",
    phone: "+90 555 000 11 22",
    website: "https://updated.example.test",
    email: "contact@example.test",
  });
  assert.deepEqual(updated[2], sampleCompanies[2]);
});

test("searches company-name substrings and combines exact sector and district filters", () => {
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, { query: "inş" }).map(
      (company) => company.id,
    ),
    ["company-a", "company-c"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "a",
    }).map((company) => company.id),
    ["company-a", "company-b", "company-c"],
  );
  assert.deepEqual(
    searchCompanyDirectory(
      [
        ...sampleCompanies,
        {
          ...sampleCompanies[1],
          id: "company-alfa",
          name: "Alfa Market",
        },
        {
          ...sampleCompanies[1],
          id: "company-kale",
          name: "Kale Alışveriş",
        },
      ],
      { query: "al" },
    ).map((company) => company.id),
    ["company-alfa", "company-kale"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "ada",
      location: "Lefkoşa",
    }).map((company) => company.id),
    ["company-b"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "girne",
    }).map((company) => company.id),
    [],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      category: "İnşaat Şirketi",
    }).map((company) => company.id),
    ["company-a", "company-c"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      location: "girne",
    }).map((company) => company.id),
    ["company-a"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      location: "kyrenia",
    }).map((company) => company.id),
    ["company-a"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      location: "famagusta",
    }).map((company) => company.id),
    ["company-c"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      location: "Küçük Kaymaklı",
    }).map((company) => company.id),
    ["company-b"],
  );
  assert.deepEqual(
    searchCompanyDirectory(sampleCompanies, {
      query: "",
      location: "unknown district",
    }),
    [],
  );
});

test("district classification uses district and locality evidence conservatively", () => {
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "12 Girne Yolu",
      municipality: "Girne",
    }),
    "Girne",
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Girne Yolu",
      municipality: null,
    }),
    null,
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Alsancak 99350",
      municipality: null,
    }),
    "Girne",
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Gazimağusa 99450",
      municipality: "Çanakkale",
    }),
    "Mağusa",
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Girne 99300",
      municipality: "Lefkoşa Türk Belediyesi",
    }),
    "Girne",
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Girne 99300; Gazimağusa 99450",
      municipality: null,
    }),
    null,
  );
  assert.equal(
    getNorthernCyprusDistrictForLocation({
      address: "Unknown location",
      municipality: null,
    }),
    null,
  );
});

test("district filtering returns only matching branches for multi-location companies", () => {
  const branches: CompanyDirectoryEntry[] = [
    {
      id: "multi-branch",
      name: "Island Retail",
      categories: ["Retail"],
      locations: [
        {
          address: "Alsancak 99350",
          municipality: null,
          phone: null,
          website: null,
        },
        {
          address: "Lefkoşa 99010",
          municipality: "Küçük Kaymaklı",
          phone: null,
          website: null,
        },
        {
          address: "Unknown address",
          municipality: null,
          phone: null,
          website: null,
        },
      ],
    },
  ];

  assert.deepEqual(
    searchCompanyDirectory(branches, { query: "", location: "Girne" }).map(
      (company) => company.locations.map((location) => location.address),
    ),
    [["Alsancak 99350"]],
  );
});

test("sorts company names by the Turkish alphabet and supports reverse order", () => {
  const names = [
    "Zeytin",
    "Şeker",
    "Sarı",
    "Özlem",
    "İzmir",
    "Isparta",
    "Güzelyurt",
    "Çanakkale",
    "Adana",
  ];
  const entries = names.map((name, index) => ({
    ...sampleCompanies[0],
    id: `sorted-${index}`,
    name,
  }));

  assert.deepEqual(
    sortCompanyDirectory(entries).map((company) => company.name),
    [
      "Adana",
      "Çanakkale",
      "Güzelyurt",
      "Isparta",
      "İzmir",
      "Özlem",
      "Sarı",
      "Şeker",
      "Zeytin",
    ],
  );
  assert.deepEqual(
    sortCompanyDirectory(entries, "descending").map((company) => company.name),
    [
      "Zeytin",
      "Şeker",
      "Sarı",
      "Özlem",
      "İzmir",
      "Isparta",
      "Güzelyurt",
      "Çanakkale",
      "Adana",
    ],
  );
});

test("merges repeated listings but preserves distinct branches", () => {
  const repeated = {
    ...sampleCompanies[0],
    id: "company-a-copy",
    locations: [
      {
        ...sampleCompanies[0].locations[0],
        address: "88 Lefkoşa Yolu",
        municipality: "Lefkoşa",
        phone: null,
      },
    ],
    categories: ["Mühendislik Firması"],
  };
  const sameId = {
    ...sampleCompanies[0],
    locations: [
      {
        ...sampleCompanies[0].locations[0],
        phone: null,
        website: null,
      },
    ],
    categories: ["İnşaat Şirketi"],
  };
  const unique = deduplicateCompanyDirectory([
    sampleCompanies[0],
    repeated,
    sameId,
    sampleCompanies[2],
  ]);

  assert.equal(unique.length, 2);
  assert.equal(
    unique[0].locations[0].phone,
    sampleCompanies[0].locations[0].phone,
  );
  assert.equal(
    unique[0].locations[0].website,
    sampleCompanies[0].locations[0].website,
  );
  assert.equal(unique[0].locations.length, 2);
  assert.deepEqual(
    searchCompanyDirectory(unique, {
      query: "",
      location: "Lefkoşa",
    }).map((company) => company.id),
    ["company-a"],
  );
  assert.deepEqual(unique[0].categories, [
    "İnşaat Şirketi",
    "Mühendislik Firması",
  ]);
  assert.equal(unique[1].locations[0].address, "5 Mağusa yolu");
});

test("groups same-name listings by phone without merging unrelated businesses", () => {
  const first = {
    ...sampleCompanies[0],
    locations: [
      {
        ...sampleCompanies[0].locations[0],
        website: null,
      },
    ],
  };
  const sameCompany = {
    ...first,
    id: "company-a-phone-copy",
    locations: [
      {
        ...first.locations[0],
        address: "88 Lefkoşa Yolu",
        municipality: "Lefkoşa",
      },
    ],
  };
  const unrelated = {
    ...first,
    id: "company-a-unrelated",
    locations: [
      {
        ...first.locations[0],
        address: "5 Mağusa yolu",
        municipality: "Gazimağusa",
        phone: "+90 392 000 00 00",
      },
    ],
  };

  const unique = deduplicateCompanyDirectory([first, sameCompany, unrelated]);

  assert.equal(unique.length, 2);
  assert.equal(unique[0].locations.length, 2);
  assert.equal(unique[1].locations[0].address, "5 Mağusa yolu");
});

test("merges same-name listings that resolve to the same district", () => {
  const thin: CompanyDirectoryEntry = {
    id: "thin-entry",
    name: "365 build & design",
    categories: ["Konut İnşaat"],
    locations: [
      {
        address: "87WH+2GG, Karaoğlanoğlu 99320",
        municipality: null,
        phone: null,
        website: null,
      },
    ],
  };
  const rich: CompanyDirectoryEntry = {
    ...thin,
    id: "rich-entry",
    name: "365 Build & Design",
    locations: [
      {
        address: "946M+VFH, Karşıyaka",
        municipality: null,
        phone: null,
        website: "http://www.365builddesign.com/",
      },
    ],
  };
  const girneBookstore: CompanyDirectoryEntry = {
    id: "girne-bookstore",
    name: "Eğitim Kitabevi",
    categories: ["Kitapçı"],
    locations: [
      {
        address: "Girne 99300",
        municipality: null,
        phone: null,
        website: null,
      },
    ],
  };
  const lefkosaBookstore: CompanyDirectoryEntry = {
    ...girneBookstore,
    id: "lefkosa-bookstore",
    locations: [
      {
        address: "Lefkoşa 99010",
        municipality: null,
        phone: null,
        website: null,
      },
    ],
  };

  const unique = deduplicateCompanyDirectory([
    thin,
    rich,
    girneBookstore,
    lefkosaBookstore,
  ]);

  assert.equal(unique.length, 3);
  assert.equal(unique[0].name, "365 Build & Design");
  assert.equal(unique[0].locations.length, 2);
  assert.deepEqual(
    unique.slice(1).map((company) => company.id),
    ["girne-bookstore", "lefkosa-bookstore"],
  );
});

test("parses quoted commas, escaped quotes and line breaks in CSV fields", () => {
  const records = parseCsvRecords(
    'place_id,title,address\r\np1,"Ada, Ltd.","Satır 1\nSatır 2"\r\np2,"The ""Best"" Cafe",Girne\r\n',
  );
  assert.deepEqual(records, [
    {
      place_id: "p1",
      title: "Ada, Ltd.",
      address: "Satır 1\nSatır 2",
    },
    {
      place_id: "p2",
      title: 'The "Best" Cafe',
      address: "Girne",
    },
  ]);
});

test("imports web URLs and does not invent missing contact fields", () => {
  const { entries } = companyEntriesFromCsv(
    [
      "place_id,title,address,categories,phone,website,municipality,latitude,longitude",
      'p1,"Ada şirketi",Girne,"Otel,Konaklama",+90 555 111,https://example.test,Girne,35.19,33.36',
      "p2,İkinci şirket,Lefkoşa,Mağaza,,,,35.2,33.36",
    ].join("\n"),
  );

  assert.deepEqual(entries[0], {
    id: "p1",
    name: "Ada şirketi",
    categories: ["Otel", "Konaklama"],
    locations: [
      {
        address: "Girne",
        municipality: "Girne",
        phone: "+90 555 111",
        website: "https://example.test/",
      },
    ],
  });
  assert.equal(entries[1].locations[0].phone, null);
  assert.equal(entries[1].locations[0].website, null);
  assert.throws(
    () =>
      companyEntriesFromCsv(
        "place_id,title,latitude,longitude,website\np1,Ada şirketi,35.19,33.36,javascript:alert(1)",
      ),
    /non-web website URL/,
  );
  assert.equal(entries[1].locations[0].municipality, null);
});

test("rejects malformed CSV and files without required identity columns", () => {
  assert.throws(
    () => parseCsvRecords('place_id,title\np1,"unfinished'),
    /unterminated quoted field/,
  );
  assert.throws(
    () => companyEntriesFromCsv("title\nAda şirketi"),
    /missing the required "place_id" column/,
  );
  assert.throws(
    () =>
      companyEntriesFromCsv(
        "place_id,title,latitude,longitude\n,Ada şirketi,35.2,33.3",
      ),
    /row 2 has no place_id/,
  );
  assert.throws(
    () =>
      companyEntriesFromCsv(
        "place_id,title,latitude,longitude\np1,Ada şirketi,invalid,33.3",
      ),
    /row 2 has invalid coordinates/,
  );
});

test("filters out coordinates beyond the approximate Northern Cyprus coverage", () => {
  assert.equal(isWithinNorthernCyprusCoverage(33.36, 35.19), true);
  assert.equal(isWithinNorthernCyprusCoverage(34.06, 35.0), false);
  assert.equal(isWithinNorthernCyprusCoverage(32.4, 35.04), false);

  const csv = [
    "place_id,title,latitude,longitude",
    "north,Ada şirketi,35.19,33.36",
    "south,Other company,35.0,34.06",
  ].join("\n");
  const imported = importCompanyDirectory([csv]);
  assert.equal(imported.sourceRecordCount, 2);
  assert.equal(imported.outOfRegionRecordCount, 1);
  assert.deepEqual(imported.entries.map((company) => company.id), ["north"]);
});

test("excludes Greek-script company names but keeps Latin-script names", () => {
  const csv = [
    "place_id,title,latitude,longitude",
    "greek,Ελληνική εταιρεία,35.19,33.36",
    "latin,Elliniki etaireia,35.19,33.36",
    "outside-greek,Εταιρεία,35.0,34.06",
  ].join("\n");
  const imported = importCompanyDirectory([csv]);

  assert.equal(imported.sourceRecordCount, 3);
  assert.equal(imported.outOfRegionRecordCount, 1);
  assert.equal(imported.greekNameRecordCount, 1);
  assert.deepEqual(imported.entries.map((company) => company.id), ["latin"]);
});
