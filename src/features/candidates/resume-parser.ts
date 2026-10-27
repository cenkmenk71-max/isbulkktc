import type {
  CandidateCertification,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
} from "./schemas";

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
    "mesleki baslik",
    "uzmanlik alani",
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
    "uzmanlik alanlari",
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
    "is deneyimi",
    "is tecrubesi",
    "calisma deneyimi",
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
    "ogrenim",
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
    "sertifikalar",
    "sertifikalar ve lisanslar",
    "сертификаты",
    "πιστοποιήσεις",
    "πιστοποιητικά",
    "گواهینامه‌ها",
    "گواهی‌ها",
    "zertifikate",
    "zertifizierungen",
  ],
};

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
for (const [section, labels] of Object.entries(sectionLabels) as [
  ResumeSection,
  string[],
][]) {
  for (const label of labels) headings.set(normalizeHeading(label), section);
}

function sectionHeading(line: string): {
  section: ResumeSection;
  remainder: string;
} | null {
  const match = line.match(/^([^:：]{1,64})\s*[:：]\s*(.*)$/);
  const label = match ? match[1] : line;
  const section = headings.get(normalizeHeading(label));
  return section ? { section, remainder: match?.[2] ?? "" } : null;
}

function sectionLines(text: string): Map<ResumeSection, string[]> {
  const content = new Map<ResumeSection, string[]>();
  let activeSection: ResumeSection | null = null;
  let lineCount = 0;

  for (const rawLine of text.split(/\r\n?|\n/)) {
    lineCount += 1;
    if (lineCount > 2_000) break;
    const line = rawLine.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
    if (!line) continue;

    const heading = sectionHeading(line);
    if (heading) {
      activeSection = heading.section;
      if (heading.remainder) {
        const lines = content.get(activeSection) ?? [];
        lines.push(heading.remainder);
        content.set(activeSection, lines);
      }
      continue;
    }

    if (activeSection) {
      const lines = content.get(activeSection) ?? [];
      lines.push(line);
      content.set(activeSection, lines);
    }
  }

  return content;
}

function cleanLine(line: string): string {
  return line.replace(/^\s*(?:[•●▪◦*-]|\d+[.)])\s*/, "").trim();
}

function splitEntry(line: string): string[] {
  return line
    .split(/\s+(?:\||·|—|–)\s+/u)
    .map(cleanLine)
    .filter(Boolean);
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

function parseExperience(lines: string[]): CandidateExperience[] {
  if (lines.length === 0) return [];
  const records = lines.map(cleanLine).filter(Boolean);
  const explicitRecords = records.map(splitEntry);

  if (records.length > 1 && explicitRecords.every((parts) => parts.length >= 2)) {
    return explicitRecords.slice(0, 12).map((parts) => ({
      role: parts[0]?.slice(0, 140) ?? "",
      organization: parts[1]?.slice(0, 160) ?? "",
      location: "",
      startDate: "",
      endDate: "",
      description: parts.slice(2).join(" · ").slice(0, 1_800),
    }));
  }

  return [
    {
      role: "",
      organization: "",
      location: "",
      startDate: "",
      endDate: "",
      description: records.join("\n").slice(0, 1_800),
    },
  ];
}

function parseEducation(lines: string[]): CandidateEducation[] {
  if (lines.length === 0) return [];
  const records = lines.map(cleanLine).filter(Boolean);
  const explicitRecords = records.map(splitEntry);

  if (records.length > 1 && explicitRecords.every((parts) => parts.length >= 2)) {
    return explicitRecords.slice(0, 12).map((parts) => ({
      institution: parts[0]?.slice(0, 160) ?? "",
      qualification: parts[1]?.slice(0, 140) ?? "",
      field: parts[2]?.slice(0, 140) ?? "",
      startDate: "",
      endDate: "",
      description: parts.slice(3).join(" · ").slice(0, 1_200),
    }));
  }

  return [
    {
      institution: records[0]?.slice(0, 160) ?? "",
      qualification: records[1]?.slice(0, 140) ?? "",
      field: "",
      startDate: "",
      endDate: "",
      description: records.slice(2).join("\n").slice(0, 1_200),
    },
  ];
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
      const [name = "", issuer = ""] = splitEntry(line);
      return {
        name: (issuer ? name : line).slice(0, 160),
        issuer: issuer.slice(0, 160),
        issueDate: "",
        expiryDate: "",
      };
    });
}

export function parseResumeText(text: string): CandidateResumeDraft {
  const sections = sectionLines(text.slice(0, 80_000));
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
