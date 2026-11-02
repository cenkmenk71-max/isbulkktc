import type {
  CandidateCertification,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
} from "./schemas";
import { resolveNorthernCyprusDistrict } from "@/features/locations/northern-cyprus-districts";

export type CandidateResumeDraft = {
  headline?: string;
  location?: string;
  skills?: string[];
  experience?: CandidateExperience[];
  education?: CandidateEducation[];
  languages?: CandidateLanguage[];
  certifications?: CandidateCertification[];
};

type ResumeSection =
  | "headline"
  | "location"
  | "skills"
  | "experience"
  | "education"
  | "languages"
  | "certifications";

const sectionLabels: Record<ResumeSection, string[]> = {
  headline: [
    "professional title",
    "professional headline",
    "headline",
    "title",
    "position",
    "mesleki baslik",
    "uzmanlik alani",
    "unvan",
    "gorev",
    "профессиональная специализация",
    "επαγγελματικός τίτλος",
    "عنوان حرفه‌ای",
    "berufliches profil",
    "beruflicher titel",
  ],
  location: [
    "location",
    "address",
    "konum",
    "adres",
    "ikametgah",
    "местоположение",
    "τοποθεσία",
    "موقعیت",
    "standort",
  ],
  skills: [
    "skills",
    "technical skills",
    "core competencies",
    "competencies",
    "beceriler",
    "yetenekler",
    "yetkinlikler",
    "uzmanlik alanlari",
    "teknik beceriler",
    "навыки",
    "ключевые навыки",
    "δεξιότητες",
    "مهارت‌ها",
    "fähigkeiten",
    "kompetenzen",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "work history",
    "career",
    "is deneyimi",
    "is deneyimleri",
    "deneyim",
    "deneyimler",
    "deneyimlerim",
    "is tecrubesi",
    "is tecrubeleri",
    "tecrube",
    "tecrubeler",
    "calisma deneyimi",
    "calisma hayati",
    "kariyer",
    "опыт работы",
    "профессиональный опыт",
    "επαγγελματική εμπειρία",
    "εμπειρία",
    "تجربه کاری",
    "سوابق شغلی",
    "berufserfahrung",
    "beruflicher werdegang",
  ],
  education: [
    "education",
    "education history",
    "academic background",
    "egitim",
    "egitim bilgileri",
    "egitim durumu",
    "ogrenim",
    "ogrenim bilgileri",
    "okullar",
    "образование",
    "εκπαίδευση",
    "σπουδές",
    "تحصیلات",
    "آموزش",
    "ausbildung",
    "studium",
  ],
  languages: [
    "languages",
    "language skills",
    "diller",
    "yabanci diller",
    "dil bilgisi",
    "языки",
    "владение языками",
    "γλώσσες",
    "زبان‌ها",
    "sprachen",
    "sprachkenntnisse",
  ],
  certifications: [
    "certifications",
    "certificates",
    "licenses",
    "courses",
    "sertifikalar",
    "sertifika ve kurslar",
    "sertifikalar ve lisanslar",
    "kurslar",
    "belgeler",
    "сертификаты",
    "πιστοποιήσεις",
    "πιστοποιητικά",
    "گواهینامه‌ها",
    "گواهی‌ها",
    "zertifikate",
    "zertifizierungen",
  ],
};

// Headings that carry no profile data but still delimit the sections around
// them, so a CV's "ÖZET" block does not leak into the preceding section.
const ignoredSectionLabels = [
  "ozet",
  "ozet bilgileri",
  "hakkimda",
  "hakkinda",
  "profil",
  "kisisel bilgiler",
  "kisisel bilgilerim",
  "summary",
  "profile",
  "about",
  "about me",
  "objective",
  "career objective",
  "personal details",
  "personal information",
  "о себе",
  "профиль",
  "σχετικά με εμένα",
  "درباره من",
  "über mich",
  "persönliche daten",
];

function normalizeHeading(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const headings = new Map<string, ResumeSection>();
const ignoredHeadings = new Set<string>();
for (const [section, labels] of Object.entries(sectionLabels) as [
  ResumeSection,
  string[],
][]) {
  for (const label of labels) headings.set(normalizeHeading(label), section);
}
for (const label of ignoredSectionLabels) {
  ignoredHeadings.add(normalizeHeading(label));
}

function sectionHeading(line: string): {
  section: ResumeSection | "ignored";
  remainder: string;
} | null {
  const match = line.match(/^([^:：]{1,64})\s*[:：]\s*(.*)$/);
  const label = match ? match[1] : line;
  const normalized = normalizeHeading(label);
  const section = headings.get(normalized);
  if (section) return { section, remainder: match?.[2] ?? "" };
  if (ignoredHeadings.has(normalized)) {
    return { section: "ignored", remainder: match?.[2] ?? "" };
  }
  return null;
}

type SectionSplit = {
  sections: Map<ResumeSection, string[]>;
  loose: string[];
};

function sectionLines(text: string): SectionSplit {
  const sections = new Map<ResumeSection, string[]>();
  const loose: string[] = [];
  let activeSection: ResumeSection | null = null;
  let seenHeading = false;
  let lineCount = 0;

  for (const rawLine of text.split(/\r\n?|\n/)) {
    lineCount += 1;
    if (lineCount > 2_000) break;
    const line = rawLine
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .trim();
    if (!line) continue;

    const heading = sectionHeading(line);
    if (heading) {
      seenHeading = true;
      activeSection = heading.section === "ignored" ? null : heading.section;
      if (heading.section !== "ignored" && heading.remainder) {
        const lines = sections.get(heading.section) ?? [];
        lines.push(heading.remainder);
        sections.set(heading.section, lines);
      }
      continue;
    }

    if (activeSection) {
      const lines = sections.get(activeSection) ?? [];
      lines.push(line);
      sections.set(activeSection, lines);
    } else if (!seenHeading) {
      loose.push(line);
    }
  }

  return { sections, loose };
}

function cleanLine(line: string): string {
  return line.replace(/^\s*(?:[•●▪◦*-]|\d+[.)])\s*/, "").trim();
}

function uniqueValues(values: string[], maximum: number): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = cleanLine(value).slice(0, 60);
    const key = normalizeHeading(trimmed);
    if (key && !unique.has(key)) unique.set(key, trimmed);
    if (unique.size === maximum) break;
  }
  return [...unique.values()];
}

const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const urlPattern = /(?:https?:\/\/|www\.)\S+/i;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/;
const countDigits = (value: string) => (value.match(/\d/g) ?? []).length;

function isContactLine(line: string): boolean {
  if (emailPattern.test(line) || urlPattern.test(line)) return true;
  // Strip date ranges first: "2020-2024" otherwise reads as a phone number.
  const match = stripDateRange(line).match(phonePattern);
  return match !== null && countDigits(match[0]) >= 8;
}

const monthNames = [
  "ocak",
  "subat",
  "şubat",
  "mart",
  "nisan",
  "mayis",
  "mayıs",
  "haziran",
  "temmuz",
  "agustos",
  "ağustos",
  "eylul",
  "eylül",
  "ekim",
  "kasim",
  "kasım",
  "aralik",
  "aralık",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
];

const monthPattern = monthNames.join("|");
const yearToken = "(?:19|20)\\d{2}";
const dateToken = `(?:\\d{1,2}[./-])?(?:(?:${monthPattern})[a-zçğıöşü]*[ .]*)?${yearToken}`;
const ongoingPattern =
  "present|current|now|halen|devam|guncel|güncel|devam ediyor|ongoing";
const dateRangePattern = new RegExp(
  `(${dateToken})\\s*(?:-|–|—|to|\\/)\\s*(${dateToken}|${ongoingPattern})`,
  "i",
);
const singleYearPattern = /(?:19|20)\d{2}/;

type DateRange = { startDate: string; endDate: string; matched: string };

function extractDateRange(line: string): DateRange | null {
  const match = line.match(dateRangePattern);
  if (match) {
    return {
      startDate: match[1].trim().slice(0, 32),
      endDate: match[2].trim().slice(0, 32),
      matched: match[0],
    };
  }
  const single = line.match(singleYearPattern);
  if (single) {
    return { startDate: single[0], endDate: "", matched: single[0] };
  }
  return null;
}

function stripDateRange(line: string, range?: DateRange | null): string {
  let result = line.replace(dateRangePattern, " ");
  if (range?.matched && !dateRangePattern.test(range.matched)) {
    result = result.replace(range.matched, " ");
  }
  return result
    .replace(/\(\s*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|·,]+|[\s\-–—|·,]+$/g, "")
    .trim();
}

function splitEntryParts(line: string): string[] {
  return line
    .split(/\s+(?:\||·|—|–|•)\s+|\s*[;,]\s*|\s+[-]\s+/u)
    .map(cleanLine)
    .filter(Boolean);
}

const allDatePattern = new RegExp(dateToken, "gi");

/** Every date token on a line, in order ("PMP | PMI | 2019 | 2024" → [2019, 2024]). */
function extractDates(line: string): string[] {
  return (line.match(allDatePattern) ?? []).map((value) => value.trim());
}

function stripDates(line: string): string {
  return line
    .replace(new RegExp(dateToken, "gi"), " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|·,]+|[\s\-–—|·,]+$/g, "")
    .trim();
}

/** A line that is nothing but a date range, e.g. "2019 - 2023" or "2016". */
function isPureDateLine(line: string, range: DateRange | null): boolean {
  if (!range) return false;
  return stripDateRange(line, range).replace(/[()\s\-–—|·,]+/g, "").length === 0;
}

/**
 * A short, unpunctuated line — the shape of a role or an employer name.
 *
 * This is what separates the *header* of the next entry from the *prose* of the
 * current one in the two-column CV layout where role, employer and dates sit on
 * three separate lines: "Software Engineer" is a header, "Led the platform
 * team." is prose.
 */
function looksLikeRoleOrCompany(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 8;
}

/**
 * True when a new entry begins within the next few lines.
 *
 * After a complete entry, a role line is only distinguishable from a prose line
 * by what follows it: an entry's header is one or two short lines followed by a
 * date range. Looking ahead for that date is what stops "Software Engineer" from
 * being appended to the previous job's description.
 */
function nextEntryStartsAt(records: string[], index: number): boolean {
  for (let look = index + 1; look <= index + 3 && look < records.length; look += 1) {
    if (extractDateRange(records[look])) return true;
  }
  return false;
}

type ResumeBlock = {
  headerLines: string[];
  dates: DateRange | null;
  descriptionLines: string[];
};

/**
 * Groups a section's lines into one block per entry.
 *
 * The previous implementation treated every line as a complete entry, so the
 * very common "role / employer / dates on three separate lines" layout lost the
 * role and the employer entirely — they were concatenated into the description —
 * and attached each date range to whichever line happened to carry it. Grouping
 * first, then reading each block, keeps the fields and their dates together.
 */
function buildBlocks(records: string[]): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  let current: ResumeBlock | null = null;

  const flush = () => {
    if (current && (current.headerLines.length || current.descriptionLines.length)) {
      blocks.push(current);
    }
    current = null;
  };

  const blank = (): ResumeBlock => ({
    headerLines: [],
    dates: null,
    descriptionLines: [],
  });

  for (let index = 0; index < records.length; index += 1) {
    const line = records[index];
    const dates = extractDateRange(line);
    const headText = stripDateRange(line, dates);
    const parts = splitEntryParts(headText).filter(Boolean);
    const structured =
      dates !== null ||
      (parts.length >= 2 && parts.every((part) => part.length <= 90));
    const pureDate = isPureDateLine(line, dates);

    if (structured) {
      const startsNew =
        current !== null &&
        ((current.dates !== null && current.headerLines.length > 0) ||
          (current.headerLines.length >= 2 && !pureDate));
      if (startsNew) flush();
      if (!current) current = blank();
      if (!pureDate && headText) current.headerLines.push(headText);
      if (dates) current.dates = dates;
      continue;
    }

    if (!current) current = blank();

    const complete = current.dates !== null && current.headerLines.length > 0;
    if (complete) {
      if (looksLikeRoleOrCompany(line) && nextEntryStartsAt(records, index)) {
        flush();
        current = blank();
        current.headerLines.push(line);
      } else {
        current.descriptionLines.push(line);
      }
    } else if (current.headerLines.length < 2) {
      current.headerLines.push(line);
    } else {
      current.descriptionLines.push(line);
    }
  }

  flush();
  return blocks;
}

function orderRoleAndOrganization(
  first: string,
  second: string,
): { role: string; organization: string } {
  if (!second) return { role: first, organization: "" };
  if (looksLikeOrganization(first) && !looksLikeOrganization(second)) {
    return { role: second, organization: first };
  }
  return { role: first, organization: second };
}

function parseExperience(lines: string[]): CandidateExperience[] {
  const records = lines.map(cleanLine).filter(Boolean);
  if (records.length === 0) return [];

  return buildBlocks(records)
    .map((block) => {
      const parts = splitEntryParts(block.headerLines[0] ?? "").filter(Boolean);
      const hasDates = block.dates !== null;
      let role = "";
      let organization = "";
      let location = "";
      let leftover: string[] = [];

      if (hasDates && parts.length < 2) {
        // Header is one short line per row: role, then employer. The order can
        // still be reversed, so the same corporate-marker check applies.
        const ordered = orderRoleAndOrganization(
          block.headerLines[0] ?? "",
          block.headerLines[1] ?? "",
        );
        role = ordered.role;
        organization = ordered.organization;
        leftover = block.headerLines.slice(2);
      } else if (parts.length >= 2) {
        const ordered = orderRoleAndOrganization(parts[0] ?? "", parts[1] ?? "");
        role = ordered.role;
        organization = ordered.organization;
        if (parts[2] && parts[2].length <= 60) location = parts[2];
        leftover = parts.slice(3);
        if (!hasDates) leftover = [...leftover, ...block.headerLines.slice(1)];
      } else {
        // No date and no separator: the section carried prose, not an entry.
        leftover = [...block.headerLines];
      }

      const description = [...leftover, ...block.descriptionLines]
        .join("\n")
        .slice(0, 1_800);

      return {
        role: role.slice(0, 140),
        organization: organization.slice(0, 160),
        location: location.slice(0, 120),
        startDate: block.dates?.startDate ?? "",
        endDate: block.dates?.endDate ?? "",
        description,
      };
    })
    .filter((entry) => Object.values(entry).some(Boolean))
    .slice(0, 12);
}

function parseEducation(lines: string[]): CandidateEducation[] {
  const records = lines.map(cleanLine).filter(Boolean);
  if (records.length === 0) return [];

  return buildBlocks(records)
    .map((block) => {
      const parts = splitEntryParts(block.headerLines[0] ?? "").filter(Boolean);
      let institution = "";
      let qualification = "";
      let field = "";
      let leftover: string[] = [];

      if (parts.length >= 2) {
        institution = parts[0] ?? "";
        qualification = parts[1] ?? "";
        field = parts[2] ?? "";
        leftover = parts.slice(3);
        if (!block.dates) leftover = [...leftover, ...block.headerLines.slice(1)];
      } else {
        // One short line per row: institution, then qualification, then field.
        institution = parts[0] ?? "";
        qualification = block.headerLines[1] ?? "";
        field = block.headerLines[2] ?? "";
        leftover = block.headerLines.slice(3);
      }

      const description = [...leftover, ...block.descriptionLines]
        .join("\n")
        .slice(0, 1_200);

      return {
        institution: institution.slice(0, 160),
        qualification: qualification.slice(0, 140),
        field: field.slice(0, 140),
        startDate: block.dates?.startDate ?? "",
        endDate: block.dates?.endDate ?? "",
        description,
      };
    })
    .filter((entry) => Object.values(entry).some(Boolean))
    .slice(0, 12);
}

function parseLanguages(lines: string[]): CandidateLanguage[] {
  const values = uniqueValues(
    lines.flatMap((line) =>
      line
        .split(/[,;،؛]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
    12,
  );

  return values.map((name) => ({ name: name.slice(0, 80), proficiency: "" }));
}

function parseCertifications(lines: string[]): CandidateCertification[] {
  return lines
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => {
      const dates = extractDates(line);
      const [name = "", issuer = ""] = splitEntryParts(stripDates(line));
      return {
        name: (issuer ? name : stripDates(line) || line).slice(0, 160),
        issuer: issuer.slice(0, 160),
        issueDate: (dates[0] ?? "").slice(0, 32),
        expiryDate: (dates[1] ?? "").slice(0, 32),
      };
    });
}

// CVs list either "Role – Company" or "Company – Role". When the first part
// carries a corporate marker it is the employer, so the two are swapped.
const organizationMarkers = [
  "ltd",
  "limited",
  "as",
  "a s",
  "sti",
  "şti",
  "inc",
  "llc",
  "gmbh",
  "corp",
  "corporation",
  "company",
  "co",
  "group",
  "holding",
  "yazilim",
  "yazılım",
  "teknoloji",
  "insaat",
  "inşaat",
  "danismanlik",
  "danışmanlık",
  "universite",
  "üniversite",
  "university",
  "hospital",
  "hastanesi",
  "bank",
  "bankasi",
  "bankası",
  "otel",
  "hotel",
  "market",
  "ticaret",
  "sanayi",
  "dernek",
  "vakif",
  "vakıf",
  "belediye",
];

const normalizedOrganizationMarkers = organizationMarkers.map(normalizeHeading);

function looksLikeOrganization(value: string): boolean {
  const normalized = ` ${normalizeHeading(value)} `;
  return normalizedOrganizationMarkers.some((marker) =>
    normalized.includes(` ${marker} `),
  );
}


const educationKeywords = [
  "universite",
  "üniversite",
  "university",
  "college",
  "fakulte",
  "fakülte",
  "lisans",
  "onlisans",
  "önlisans",
  "yuksek lisans",
  "yüksek lisans",
  "doktora",
  "bachelor",
  "master",
  "phd",
  "bsc",
  "msc",
  "mba",
  "okul",
  "lise",
  "akademi",
  "institute",
  "institut",
];

const normalizedEducationKeywords = educationKeywords.map(normalizeHeading);

function looksLikeEducation(line: string): boolean {
  const normalized = normalizeHeading(line);
  return normalizedEducationKeywords.some((keyword) =>
    normalized.includes(keyword),
  );
}

function looksLikeSkillsList(line: string): boolean {
  const parts = line
    .split(/[,;،؛|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return false;
  const shortParts = parts.filter((part) => part.split(/\s+/).length <= 3);
  return shortParts.length / parts.length >= 0.7 && line.length <= 240;
}

function looksLikeEntry(line: string): boolean {
  if (extractDateRange(line)) return true;
  const parts = splitEntryParts(line).filter(Boolean);
  return parts.length >= 2 && parts.every((part) => part.length <= 90);
}

/**
 * Best-effort section inference for CVs that carry no recognizable headings —
 * the common case for exports from word processors and job boards. It only
 * classifies existing lines; it never invents values.
 */
function inferSections(loose: string[]): Map<ResumeSection, string[]> {
  const sections = new Map<ResumeSection, string[]>();
  const push = (section: ResumeSection, value: string) => {
    const lines = sections.get(section) ?? [];
    lines.push(value);
    sections.set(section, lines);
  };

  let bodyStart = 0;
  const firstLine = loose[0];
  // The first line is the candidate's name unless it already looks like data.
  if (
    firstLine &&
    !isContactLine(firstLine) &&
    firstLine.split(/\s+/).length <= 5 &&
    !looksLikeEntry(firstLine) &&
    !looksLikeSkillsList(firstLine)
  ) {
    bodyStart = 1;
  }

  for (let index = bodyStart; index < loose.length; index += 1) {
    const line = loose[index];
    if (!line || isContactLine(line)) continue;

    if (resolveNorthernCyprusDistrict(line)) {
      if (!sections.has("location")) push("location", line);
      continue;
    }

    if (looksLikeSkillsList(line)) {
      push("skills", line);
      continue;
    }

    if (looksLikeEducation(line)) {
      push("education", line);
      continue;
    }

    if (index === bodyStart && line.length <= 90) {
      push("headline", line);
      continue;
    }

    if (looksLikeEntry(line)) {
      push("experience", line);
      continue;
    }

    // A bulleted or free-text line: attach it to the section it most likely
    // continues, defaulting to experience so the text is not dropped.
    if (sections.has("experience")) {
      push("experience", line);
    } else if (!sections.has("headline")) {
      push("headline", line);
    } else {
      push("experience", line);
    }
  }

  return sections;
}

function mergeSections(
  primary: Map<ResumeSection, string[]>,
  fallback: Map<ResumeSection, string[]>,
): Map<ResumeSection, string[]> {
  const merged = new Map(primary);
  for (const [section, lines] of fallback) {
    if (!merged.has(section)) merged.set(section, lines);
  }
  return merged;
}

export function parseResumeText(text: string): CandidateResumeDraft {
  const { sections: detected, loose } = sectionLines(text.slice(0, 80_000));
  const inferred = inferSections(loose);
  const sections = mergeSections(detected, inferred);

  const first = (section: ResumeSection, maximum: number) =>
    (sections.get(section)?.[0] ?? "").slice(0, maximum);
  const skills = uniqueValues(
    (sections.get("skills") ?? []).flatMap((line) =>
      line.split(/[,;،؛|•●▪◦]+/),
    ),
    40,
  );

  return {
    ...(first("headline", 140) ? { headline: first("headline", 140) } : {}),
    ...(first("location", 120) ? { location: first("location", 120) } : {}),
    ...(skills.length ? { skills } : {}),
    ...(sections.has("experience")
      ? { experience: parseExperience(sections.get("experience") ?? []) }
      : {}),
    ...(sections.has("education")
      ? { education: parseEducation(sections.get("education") ?? []) }
      : {}),
    ...(sections.has("languages")
      ? { languages: parseLanguages(sections.get("languages") ?? []) }
      : {}),
    ...(sections.has("certifications")
      ? {
          certifications: parseCertifications(
            sections.get("certifications") ?? [],
          ),
        }
      : {}),
  };
}

export function hasResumeDraftContent(draft: CandidateResumeDraft): boolean {
  return Boolean(
    draft.headline ||
      draft.location ||
      draft.skills?.length ||
      draft.experience?.some((entry) => Object.values(entry).some(Boolean)) ||
      draft.education?.some((entry) => Object.values(entry).some(Boolean)) ||
      draft.languages?.length ||
      draft.certifications?.length,
  );
}
