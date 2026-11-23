import type {
  CandidateCertification,
  CandidateCourse,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
  CandidateInternship,
  CandidateProject,
  CandidatePublication,
  CandidateAward,
  CandidateVolunteer,
  CandidateReference,
} from "./schemas";
import { resolveNorthernCyprusDistrict } from "@/features/locations/northern-cyprus-districts";
import { mapLanguageNameToCode } from "./language-mapping";
import { mapProficiencyToCEFR } from "./cefr-alignment";
import { trLowercase } from "@/lib/tr-lowercase";

export type CandidateLink = {
  label: string;
  url: string;
};

export type CandidateResumeDraft = {
  headline?: string;
  location?: string;
  skills?: string[];
  experience?: CandidateExperience[];
  internships?: CandidateInternship[];
  education?: CandidateEducation[];
  languages?: CandidateLanguage[];
  certifications?: CandidateCertification[];
  courses?: CandidateCourse[];
  projects?: CandidateProject[];
  publications?: CandidatePublication[];
  awards?: CandidateAward[];
  volunteer?: CandidateVolunteer[];
  references?: CandidateReference[];
  summary?: string;
  cvFullText?: string;
  links?: CandidateLink[];
};

type ResumeSection =
  | "headline"
  | "location"
  | "skills"
  | "experience"
  | "education"
  | "languages"
  | "certifications"
  | "summary"
  | "links";

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
    "konum",
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
  summary: [
    "ozet",
    "ozet bilgileri",
    "hakkimda",
    "hakkinda",
    "profil",
    "summary",
    "profile",
    "about",
    "about me",
    "objective",
    "career objective",
    "о себе",
    "профиль",
    "σχετικά με εμένα",
    "درباره من",
    "über mich",
    "zusammenfassung",
  ],
  links: [
    "links",
    "linkler",
    "bağlantılar",
    "baglanti",
    "profil links",
    "profile links",
    "ссылки",
    "σύνδεσμοι",
    "پیوندها",
    "links",
    "verknüpfungen",
  ],
};

// Headings that carry no profile data but still delimit the sections around
// them, so a CV's "ÖZET" block does not leak into the preceding section.
const ignoredSectionLabels = [
  "kisisel bilgiler",
  "kisisel bilgilerim",
  "personal details",
  "personal information",
  // An address block is personal data, not the candidate's headline or
  // location, so "Adres: Lefkoşa" must not become the profile location (#208).
  // "Location:"/"Konum:" stay real location labels. Other personal fields
  // (phone, birth date, ID) are handled by `isPersonalDataLine`, which filters
  // the *date* on the line without consuming the line as a heading.
  "adres",
  "address",
  "ikametgah",
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
      // A heading may carry its first entry inline ("DENEYİM: Acme - Dev -
      // 2019 - 2022"), but the remainder can also be a personal-data line
      // ("EĞİTİM: Doğum Tarihi: 1995"); it reaches the section by the same
      // route as a body line, so it needs the same filter (#367, #208 §B6).
      if (
        heading.section !== "ignored" &&
        heading.remainder &&
        !isSectionPersonalData(heading.remainder)
      ) {
        const lines = sections.get(heading.section) ?? [];
        lines.push(heading.remainder);
        sections.set(heading.section, lines);
      }
      continue;
    }

    if (activeSection) {
      if (isSectionPersonalData(line)) continue;
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
// A numeric month (01-12). Bounding it is what lets the year-first form below
// read "2019-03" as a date while "2019-2021" stays a year range — an unbounded
// "month" would swallow the second year. The `(?!\d)` keeps a bare year range
// like "1999-2000" from being read as "1999-2" + "000".
const monthNumberToken = "(?:0?[1-9]|1[0-2])(?!\\d)";
// `month.year` ("03.2019") and `year.month` ("2019.03") are both common. Only
// the first was supported, so "2019.03 - 2021.05" matched the bare years and
// the month fragments leaked into `location`/`description` (#208). The
// year-first form is listed first: regex alternation takes the first match, and
// the bare-year branch would otherwise stop at "2021" and strand ".05".
const dateToken = `(?:${yearToken}[./-]${monthNumberToken}|(?:\\d{1,2}[./-])?(?:(?:${monthPattern})[a-zçğıöşü]*[ .]*)?${yearToken})`;
// Longer alternatives first: "devam ediyor" must win over "devam", or the
// regex stops at "devam" and leaves "ediyor" as a stray location (#208).
const ongoingPattern =
  "devam ediyor|present|current|now|halen|devam|guncel|güncel|ongoing";
// `|` is a separator a tabular CV uses between the start and end year
// ("Acme | Dev | 2019 | 2023"); without it the end date is lost (#208).
const dateRangePattern = new RegExp(
  `(${dateToken})\\s*(?:-|–|—|to|\\/|\\|)\\s*(${dateToken}|${ongoingPattern})`,
  "i",
);
const singleYearPattern = /(?:19|20)\d{2}/;

/**
 * Words that mark a line as personal data rather than an employment or
 * education period. A CV's birth date, address and phone lines carry years too,
 * and the date token accepts a bare year, so without this filter
 * "1995-2000 doğumlu" or "Adres: Lefkoşa - 2019" leaked a year into work
 * experience (#208).
 *
 * Stems match Turkish suffixes ("doğum" → "doğumlu", "adres" → "adresi");
 * ambiguous English words stay exact so "management" does not read as "age".
 * "doğu" (east, as in "Doğu Akdeniz Üniversitesi") is deliberately not a stem.
 */
const personalDataStems = [
  "doğum",
  "dogum",
  "telefon",
  "adres",
  "kimlik",
  "pasaport",
  "nüfus",
  "nufus",
  "medeni",
];
const personalDataWords = new Set([
  "age",
  "born",
  "birth",
  "birthday",
  "dob",
  "address",
  "phone",
  "tel",
  "gsm",
  "tc",
  "tcno",
  "yaş",
  "yaşı",
  "yaşında",
  "yas",
  "iban",
  // Personal-status fields. Deliberately unambiguous tokens only: generic
  // English adjectives ("single", "married") appear in ordinary CV prose, so
  // they are not treated as personal data here.
  "marital",
  "cinsiyet",
  "uyruk",
  "ehliyet",
]);

/** True when a single word is a personal-data token or stem. */
function isPersonalDataToken(word: string): boolean {
  // The vocabulary is written in ASCII ("iban"); `wordsOf` lower-cases with the
  // Turkish locale, which turns an ASCII capital I into a dotless "ı" ("IBAN" →
  // "ıban"). Fold it back before matching, or every ASCII token that carries an
  // I slips through ("IBAN: TR12 3456" became a job description — #208 §B6).
  const folded = word.replace(/ı/g, "i");
  const candidates = folded === word ? [word] : [word, folded];
  return candidates.some(
    (candidate) =>
      personalDataWords.has(candidate) ||
      personalDataStems.some((stem) => candidate.startsWith(stem)),
  );
}

function wordsOf(value: string): string[] {
  return trLowercase(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// The shapes a CV uses *between* the fields of one record. A comma is
// deliberately absent: a personal line comma-separates values ("Telefon: 0533,
// 0534"), not fields, so a comma must not promote it to a record.
const strongEntrySeparatorSource = "\\s+(?:\\||·|—|–|•)\\s+|\\s+[-]\\s+";
const strongEntrySeparatorPattern = new RegExp(strongEntrySeparatorSource, "u");

/**
 * True when the line carries the shapes a CV uses *between* the fields of one
 * record.
 */
function hasStrongEntrySeparator(line: string): boolean {
  return strongEntrySeparatorPattern.test(line);
}

/**
 * Whether a line is the candidate's personal data rather than content.
 *
 * A personal-data word alone cannot decide: a job title can contain one — "Adres
 * Doğrulama Uzmanı", "Telefon Satış Temsilcisi", "Doğum Kliniği Hemşiresi" are
 * all real roles. Reading those as personal data made `extractDateRange` bail,
 * so the entry silently lost its dates (#367). A detail, by contrast, names
 * itself in the line's *first* field as a label that is nothing but the token
 * ("Telefon: 0533…", "Adres: Lefkoşa - 2019", "Adres | Lefkoşa"), or as a bare
 * line with no entry separator at all ("1995-2000 doğumlu"). A title that merely
 * contains the word is a later field of a separated record.
 */
function isPersonalDataLine(line: string): boolean {
  const [firstField = ""] = splitEntryParts(line);
  const words = wordsOf(firstField);
  if (!words.some(isPersonalDataToken)) return false;
  const labelWords = wordsOf(firstField.split(/[:：]/)[0]);
  const labelIsTokenOnly =
    labelWords.length > 0 && labelWords.every(isPersonalDataToken);
  return labelIsTokenOnly || !hasStrongEntrySeparator(line);
}

/**
 * The same question as `isPersonalDataLine`, asked where the answer must also
 * keep a bare role line. A section's body has no other signal: `sectionLines`
 * pushes each line straight to the section parser, so a detail that reaches it
 * is written into `description`/`institution`/`name`/`skills` and then copied
 * into the profile by `mergeResumeDraft` (#367, #208 §B6).
 *
 * `isPersonalDataLine` alone is too eager here. A multi-line entry puts the role
 * on a line of its own ("Doğum Kliniği Hemşiresi"), and a role line is exactly
 * the shape of an unlabelled detail: one field, no separator, a personal-data
 * word inside it. Dropping every such line left the employer in the role box —
 * or, when the entry carried no date, dropped the role entirely. So the section
 * only drops a line when it *names* the detail: a token-only label
 * ("Telefon: …"), a line carrying its own year ("1995-2000 doğumlu"), or a
 * contact value. A bare title that merely contains the word is kept.
 */
function isSectionPersonalData(line: string): boolean {
  // A contact line — phone, e-mail, URL — is personal data wherever it sits.
  // The loose path already drops it through `isContactLine`; the section path
  // had no equivalent, so "Cep: 0533 123 45 67" under "DENEYİM" reached
  // `description` and a phone number landed in the profile (#208 §B6).
  if (isContactLine(line)) return true;

  if (!isPersonalDataLine(line)) return false;

  const [firstField = ""] = splitEntryParts(line);

  // A field that is nothing but the token ("Telefon:", "Adres | Lefkoşa") names
  // the detail itself, wherever it sits; no role reads that way.
  const labelWords = wordsOf(firstField.split(/[:：]/)[0]);
  if (labelWords.length > 0 && labelWords.every(isPersonalDataToken)) return true;

  // A line that carries its own year in its first field ("1995-2000 doğumlu",
  // "1995-2000 doğumlu, Lefkoşa") is a detail: a role header states role and
  // employer, and its dates sit on a line of their own, not inside the title.
  return singleYearPattern.test(firstField);
}

/**
 * A range whose two endpoints are years must run forwards, stay plausible
 * (a >60-year "career" is a misread, not a period), and not start in the future
 * (a date that has not happened is a misread too — #208). Endpoints that are not
 * years — "Present", "Halen" — are always accepted, since an ongoing role is
 * legitimately open-ended.
 */
function isValidYearRange(start: string, end: string): boolean {
  const startYear = singleYearPattern.exec(start)?.[0];
  const endYear = singleYearPattern.exec(end)?.[0];
  if (!startYear || !endYear) return true;
  const from = Number(startYear);
  const to = Number(endYear);
  const currentYear = new Date().getUTCFullYear();
  return from <= to && to - from <= 60 && from <= currentYear;
}

type DateRange = { startDate: string; endDate: string; matched: string };

function extractDateRange(line: string): DateRange | null {
  if (isPersonalDataLine(line)) return null;
  const match = line.match(dateRangePattern);
  if (match) {
    const startDate = match[1].trim().slice(0, 32);
    const endDate = match[2].trim().slice(0, 32);
    // A backwards or absurd range is a misread; reject it outright rather than
    // falling back to its bare start year.
    if (!isValidYearRange(startDate, endDate)) return null;
    return { startDate, endDate, matched: match[0] };
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

// Field splitting also treats a comma/semicolon as a separator — a labelled
// entry ("Role, Company, 2019") uses one — unlike `hasStrongEntrySeparator`.
const entryPartsPattern = new RegExp(`${strongEntrySeparatorSource}|\\s*[;,]\\s*`, "u");

function splitEntryParts(line: string): string[] {
  return line
    .split(entryPartsPattern)
    .map(cleanLine)
    .filter(Boolean);
}

const allDatePattern = new RegExp(dateToken, "gi");

/** Every date token on a line, in order ("PMP | PMI | 2019 | 2024" → [2019, 2024]). */
function extractDates(line: string): string[] {
  if (isPersonalDataLine(line)) return [];
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
 * The earliest year on the line, or null. Used to spot a line dated entirely in
 * the future: it cannot be work history, so the line is not an entry at all
 * (#208) — distinct from a backwards or over-long range, which is a typo on a
 * real entry and keeps the entry with its dates cleared.
 */
function firstYearIn(line: string): number | null {
  const match = singleYearPattern.exec(line);
  return match ? Number(match[0]) : null;
}

/**
 * True when the line is just a comma/pipe-separated list of districts
 * ("Lefkoşa, Girne") — a location, not a professional headline. A single
 * district already resolves through `resolveNorthernCyprusDistrict`; this only
 * catches the multi-district list that resolves to `null` as a whole (#339).
 */
function looksLikeDistrictList(line: string): boolean {
  const segments = line
    .split(/[,;/|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return false;
  return segments.every((segment) => resolveNorthernCyprusDistrict(segment) !== null);
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
 * A line that is a whole entry by itself: a date range plus two or more labelled
 * fields ("Role | Employer | 2019 - 2023"). It carries its own header, so a
 * short line immediately above it belongs to the *previous* entry, not to this
 * one — the shape a bulleted description ("React ve Node.js ile ürün
 * geliştirme") was misread as the next role (#208).
 */
function isSelfContainedEntry(line: string): boolean {
  const dates = extractDateRange(line);
  if (!dates) return false;
  // Count parts the same way `parseExperience` does, so the two agree on
  // whether the line is a whole entry.
  return splitEntryParts(stripDateRange(line, dates)).length >= 2;
}

/**
 * True when a new entry begins within the next few lines.
 *
 * After a complete entry, a role line is only distinguishable from a prose line
 * by what follows it: an entry's header is one or two short lines followed by a
 * date range. Looking ahead for that date is what stops "Software Engineer" from
 * being appended to the previous job's description.
 *
 * The lookahead must skip a *self-contained* entry: when the date sits on a line
 * that already carries its own role and employer, the current short line is the
 * previous entry's prose, not a header (#208).
 */
function nextEntryStartsAt(records: string[], index: number): boolean {
  for (let look = index + 1; look <= index + 3 && look < records.length; look += 1) {
    if (!extractDateRange(records[look])) continue;
    return !isSelfContainedEntry(records[look]);
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
    // `|` is a column separator in a tabular CV, so the header is split on it
    // before the date is stripped — otherwise "| 2023" survives as a field (#208).
    const headText = stripDateRange(line.split("|").join(" - "), dates);
    const parts = splitEntryParts(headText).filter(Boolean);
    const structured =
      dates !== null ||
      (parts.length >= 2 && parts.every((part) => part.length <= 90));
    const pureDate = isPureDateLine(line, dates);

    // A line whose earliest year is still in the future is not work history
    // (#208). Skip it entirely rather than keep a dateless entry for it.
    const firstYear = firstYearIn(line);
    if (structured && firstYear !== null && firstYear > new Date().getUTCFullYear()) {
      continue;
    }

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

// A word that names a school rather than a degree. Used to tell which of two
// education fields is the institution when the CV lists the degree first
// ("Bilgisayar Mühendisliği | Doğu Akdeniz Üniversitesi"). Suffixes match by
// prefix ("universitesi" → "universite"); "lise" is deliberately absent, since
// it is a prefix of "lisans" (a degree) and would read the degree as a school.
const educationInstitutionMarkers = [
  "universite",
  "university",
  "college",
  "institute",
  "institut",
  "akademi",
  "academy",
  "fakulte",
  "okul",
  "school",
];

function looksLikeEducationInstitution(value: string): boolean {
  return normalizeHeading(value)
    .split(" ")
    .some((word) =>
      educationInstitutionMarkers.some((marker) => word.startsWith(marker)),
    );
}

/**
 * Puts the institution in `institution` and the degree in `qualification`,
 * whichever order the CV used. Unlike a role, a degree carries no marker, so the
 * institution is identified by its own name ("… Üniversitesi") and swapped when
 * it comes second — a degree-first entry otherwise wrote the field of study into
 * the institution box (#208).
 */
function orderInstitutionAndQualification(
  first: string,
  second: string,
): { institution: string; qualification: string } {
  if (!second) return { institution: first, qualification: "" };
  if (looksLikeEducationInstitution(second) && !looksLikeEducationInstitution(first)) {
    return { institution: second, qualification: first };
  }
  return { institution: first, qualification: second };
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
        company: organization.slice(0, 160),
        role: role.slice(0, 140),
        district: (((location && location.slice(0, 120)) || "") as CandidateExperience["district"]),
        startDate: block.dates?.startDate || null,
        endDate: block.dates?.endDate || null,
        isCurrent: false,
        description,
        achievements: [],
        sector: undefined,
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
        const ordered = orderInstitutionAndQualification(
          parts[0] ?? "",
          parts[1] ?? "",
        );
        institution = ordered.institution;
        qualification = ordered.qualification;
        field = parts[2] ?? "";
        leftover = parts.slice(3);
        if (!block.dates) leftover = [...leftover, ...block.headerLines.slice(1)];
      } else {
        // One short line per row: institution, then qualification, then field.
        const ordered = orderInstitutionAndQualification(
          block.headerLines[0] ?? "",
          block.headerLines[1] ?? "",
        );
        institution = ordered.institution;
        qualification = ordered.qualification;
        field = block.headerLines[2] ?? "";
        leftover = block.headerLines.slice(3);
      }

      const description = [...leftover, ...block.descriptionLines]
        .join("\n")
        .slice(0, 1_200);

      return {
        level: ("other" as CandidateEducation["level"]),
        institution: institution.slice(0, 160),
        department: field.slice(0, 140),
        degree: qualification.slice(0, 140) || null,
        startYear: block.dates?.startDate?.slice(0, 4) || null,
        endYear: block.dates?.endDate?.slice(0, 4) || null,
        gpa: undefined,
        isOngoing: false,
        location: null,
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

  return values.map((name) => {
    const mapped = mapLanguageNameToCode(name);
    const proficiencyMatch = name.match(
      /\b(native|ana dil|mother tongue|fluent|advanced|ileri|upper intermediate|orta\.?[üu]st\.?|intermediate|orta|elementary|temel|beginner|başlangıç|c2|c1|b2|b1|a2|a1|expert|proficient|good|fair|basic|ilr \d|dlpt \d)\b/i
    );
    const proficiency = proficiencyMatch
      ? mapProficiencyToCEFR(proficiencyMatch[1])
      : "B1";
    const standardName = mapped?.standardNameTr ?? name.slice(0, 80);
    return {
      language: (mapped?.code ?? "other") as CandidateLanguage["language"],
      proficiency: (proficiency as CandidateLanguage["proficiency"]),
      language_name_localized: undefined,
    };
  });
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

    // A labeled personal-data line ("Adres: Lefkoşa - 2019") must not become a
    // profile field — its value is not a headline or a location (#208).
    if (/^[^:：]{1,64}\s*[:：]/.test(line) && isPersonalDataLine(line)) continue;

    // An unlabelled personal-data line ("1995-2000 doğumlu") is not a headline
    // either (#339). The labeled gate above does not catch it, and the
    // `index === bodyStart` branch below would otherwise take it as the
    // candidate's professional title.
    if (isPersonalDataLine(line)) continue;

    if (resolveNorthernCyprusDistrict(line)) {
      if (!sections.has("location")) push("location", line);
      continue;
    }

    // A bare district list ("Lefkoşa, Girne") is a location, not a headline.
    if (looksLikeDistrictList(line)) {
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

/**
 * Extract URLs from text and normalize them.
 * - bare `www.example.com` or `example.com` → prepend `https://`
 * - detect LinkedIn/GitHub/etc. subdomains for label derivation
 * - deduplicate by normalized full URL
 * - if a link's label field stays empty, default label to hostname
 */
function extractLinks(text: string): CandidateLink[] {
  // URL patterns to match
  const urlPattern = /(?:https?:\/\/|www\.|linkedin\.com\/in\/|github\.com\/|gitlab\.com\/|behance\.net\/|x\.com\/|twitter\.com\/|portfolio\.|dribbble\.com\/|medium\.com\/|dev\.to\/)[\w.-]+(?:\/[\w.-]*)*/gi;
  
  // Extract all URLs
  const urls = text.match(urlPattern) || [];
  
  // Normalize and deduplicate URLs
  const seenUrls = new Set<string>();
  const links: CandidateLink[] = [];
  
  for (const url of urls) {
    // Normalize URL
    let normalizedUrl = url.trim();
    
    // Prepend https:// if needed
    if (normalizedUrl.startsWith('www.')) {
      normalizedUrl = 'https://' + normalizedUrl;
    } else if (!normalizedUrl.startsWith('http')) {
      // Try to detect common domains and prepend https://
      if (/^(linkedin|github|gitlab|behance|x|twitter|dribbble|medium|dev)\./i.test(normalizedUrl)) {
        normalizedUrl = 'https://' + normalizedUrl;
      } else {
        // For other domains, try to extract domain and prepend https://
        const domainMatch = normalizedUrl.match(/^([a-zA-Z0-9.-]+)(?:\/|$)/);
        if (domainMatch && domainMatch[1]) {
          normalizedUrl = 'https://' + domainMatch[1];
        }
      }
    }
    
    // Skip if invalid or already seen
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
    
    // Derive label from hostname
    let label = '';
    try {
      const urlObj = new URL(normalizedUrl);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Special cases for common platforms
      if (hostname.includes('linkedin.com')) {
        label = 'LinkedIn';
      } else if (hostname.includes('github.com')) {
        label = 'GitHub';
      } else if (hostname.includes('gitlab.com')) {
        label = 'GitLab';
      } else if (hostname.includes('behance.net')) {
        label = 'Behance';
      } else if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
        label = 'X';
      } else if (hostname.includes('dribbble.com')) {
        label = 'Dribbble';
      } else if (hostname.includes('medium.com')) {
        label = 'Medium';
      } else if (hostname.includes('dev.to')) {
        label = 'Dev.to';
      } else if (hostname.includes('portfolio')) {
        label = 'Portfolio';
      } else {
        // Default to hostname without www and TLD
        label = hostname.replace(/^www\./, '').split('.')[0];
      }
    } catch {
      // If URL parsing fails, use the domain part
      const domainMatch = normalizedUrl.match(/(?:https?:\/\/)?([^\/]+)/);
      if (domainMatch && domainMatch[1]) {
        label = domainMatch[1].replace(/^www\./, '').split('.')[0];
      } else {
        label = 'Website';
      }
    }
    
    // Cap label length
    label = label.slice(0, 120);
    
    // Add to results
    links.push({
      label,
      url: normalizedUrl.slice(0, 600),
    });
    
    seenUrls.add(normalizedUrl);
    
    // Cap at 12 entries
    if (links.length >= 12) break;
  }
  
  return links;
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

  // Extract summary from summary section
  let summary = "";
  if (sections.has("summary")) {
    const summaryLines = sections.get("summary") ?? [];
    // Filter out contact lines
    const filteredLines = summaryLines.filter(line => !isContactLine(line));
    summary = filteredLines.join("\n").slice(0, 2000);
  }
  
  // Extract links from entire text
  const links = extractLinks(text);

  // Store the full raw CV text (truncated to 100k chars for storage)
  const cvFullText = text.slice(0, 100_000);

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
    ...(summary ? { summary } : {}),
    cvFullText,
    ...(links.length ? { links } : {}),
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
      draft.certifications?.length ||
      draft.summary ||
      draft.links?.length,
  );
}
