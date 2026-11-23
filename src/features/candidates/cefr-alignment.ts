import type { ProficiencyCode } from "./language-extraction";

export interface ProficiencyMappingEntry {
  code: ProficiencyCode;
  aliases: string[];
}

const PROFICIENCY_MAPPING_MATRIX: ProficiencyMappingEntry[] = [
  {
    code: "Native",
    aliases: [
      "native",
      "ana dil",
      "ana dili",
      "mother tongue",
      "first language",
      "l1",
      "родинный",
      "родной язык",
      "muttersprache",
      "langue maternelle",
      "lengua materna",
      "lingua madre",
      "moedertaal",
      "język ojczysty",
      "рідна мова",
      "limba maternă",
      "anyanyelv",
      "родин език",
      "mađarski",
      "მდღომარე ენა",
      "母语",
      "母語",
      "زبان مادری",
      "اللغة الأم",
      "لغة الام",
    ],
  },
  {
    code: "C2",
    aliases: [
      "c2",
      "mastery",
      "proficient",
      "near native",
      "near-native",
      "native-like",
      "expert",
      "complete fluency",
      "full professional proficiency",
      "ilr 5",
      "dlpt 5",
      "мастерство",
      "совершенство",
      "meinung",
      "maîtrise",
      "dominio",
      "padronanza",
      "beheersing",
      "mistrzowskie",
      "провідний",
      "avansat",
      "szakértő",
      "експертно",
      "მაგისტრი",
      "精通",
      "精通",
      "مسلط",
      "متمكن",
      "إتقان",
    ],
  },
  {
    code: "C1",
    aliases: [
      "c1",
      "advanced",
      "ileri",
      "ileri duzey",
      "ileri düzey",
      "high",
      "fluent",
      "akıcı",
      "effective operational proficiency",
      "professional working proficiency",
      "ilr 4",
      "dlpt 4",
      "продвинутый",
      "avancé",
      "avanzado",
      "avanzato",
      "gevorderd",
      "zaawansowany",
      "продовжений",
      "avansat",
      "haladó",
      "напреднал",
      "ავანსირებული",
      "高级",
      "高級",
      "پیشرفته",
      "متقدم",
      "متقدم",
    ],
  },
  {
    code: "B2",
    aliases: [
      "b2",
      "upper intermediate",
      "upper-intermediate",
      "orta uste",
      "orta üstü",
      "high intermediate",
      "good",
      "iyi",
      "vantage",
      "independent user",
      "ilr 3",
      "dlpt 3",
      "средне-продвинутый",
      "intermédiaire supérieur",
      "intermedio alto",
      "intermedio superiore",
      "boven gemiddeld",
      "średniozaawansowany",
      "вище середнього",
      "intermediar avansat",
      "felső középfok",
      "горе-долу средно",
      "ბ Zwe",
      "中高级",
      "中高級",
      "بالا-متوسط",
      "فوق المتوسط",
      "فوق المتوسط",
    ],
  },
  {
    code: "B1",
    aliases: [
      "b1",
      "intermediate",
      "orta",
      "middle",
      "fair",
      "ortalama",
      "threshold",
      "independent user basic",
      "ilr 2",
      "dlpt 2",
      "средний",
      "intermédiaire",
      "intermedio",
      "intermedio",
      "gemiddeld",
      "średni",
      "середній",
      "intermediar",
      "középfok",
      "средно",
      "ინტერმედიატე",
      "中级",
      "中級",
      "متوسط",
      "متوسط",
      "متوسط",
    ],
  },
  {
    code: "A2",
    aliases: [
      "a2",
      "elementary",
      "temel",
      "basic",
      "basit",
      "basique",
      "basico",
      "basis",
      "podstawowy",
      "элементарный",
      "elementar",
      "alapfok",
      "елементарно",
      "ელემენტარული",
      "初级",
      "初級",
      "مقدماتی",
      "أساسي",
      "اساسي",
    ],
  },
  {
    code: "A1",
    aliases: [
      "a1",
      "beginner",
      "baslangic",
      "başlangıç",
      "start",
      "débutant",
      "principiante",
      "principiante",
      "beginner",
      "początkujący",
      "начальный",
      "începător",
      "kezdő",
      "начално",
      "დამწყები",
      "入门",
      "入門",
      "مبتدی",
      "مبتدئ",
      "مبتدى",
    ],
  },
];

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

const normalizedProficiencyCache = new Map<string, ProficiencyCode>();

for (const entry of PROFICIENCY_MAPPING_MATRIX) {
  for (const alias of entry.aliases) {
    const normalized = normalizeForMatching(alias);
    if (!normalizedProficiencyCache.has(normalized)) {
      normalizedProficiencyCache.set(normalized, entry.code);
    }
  }
}

export function mapProficiencyToCEFR(proficiencyText: string): ProficiencyCode {
  const normalized = normalizeForMatching(proficiencyText);
  const code = normalizedProficiencyCache.get(normalized);
  if (code) return code;

  const words = normalized.split(/\s+/);
  for (const word of words) {
    const code = normalizedProficiencyCache.get(word);
    if (code) return code;
  }

  return "B1";
}

export function getAllProficiencyCodes(): ProficiencyCode[] {
  return PROFICIENCY_MAPPING_MATRIX.map((e) => e.code);
}