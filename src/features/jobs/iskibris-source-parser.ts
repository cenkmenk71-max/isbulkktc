export type IskibrisSourceCard = {
  id: string;
  title: string;
  companyName: string;
  logoUrl: string | null;
};

export type IskibrisSourceJob = {
  id: number;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  description: string;
  jobType: "full_time" | "part_time" | "contract" | "temporary" | "internship" | "freelance";
  district: string | null;
  publishedAt: string;
  expiresAt: string;
  workplaceMode: "on_site" | "hybrid" | "remote" | null;
};

const jobTypeMap: Array<[RegExp, IskibrisSourceJob["jobType"]]> = [
  [/tam[\s-]*zamanl[ıi]|full[\s-]*time/i, "full_time"],
  [/yar[ıi]m[\s-]*zamanl[ıi]|part[\s-]*time/i, "part_time"],
  [/s[öo]zle[sş]mel[iı]|contract/i, "contract"],
  [/ge[çc]ici|temporary/i, "temporary"],
  [/staj|intern(ship)?/i, "internship"],
  [/serbest|freelance/i, "freelance"],
];

const supportedDistricts = new Set([
  "Lefkoşa",
  "Mağusa",
  "Girne",
  "Güzelyurt",
  "İskele",
  "Lefke",
]);

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

function normalizeText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function resolveIskibrisLogoUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://www.iskibris.com");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "innovia-iskibris.s3.eu-west-2.amazonaws.com"
    ) {
      return null;
    }

    url.pathname = url.pathname.replace(/-thumb(?:@\d+)?(?=\.[^.]+$)/i, "");
    return url.toString();
  } catch {
    return null;
  }
}

function extractLogoUrl(block: string): string | null {
  const image = /<img\b([^>]*)>/i.exec(block)?.[1];
  if (!image) return null;

  const srcSet = /\bsrcset=["']([^"']+)["']/i.exec(image)?.[1];
  if (srcSet) {
    const candidates = [...srcSet.matchAll(/(https:\/\/[^,\s]+)\s+(\d+)w/gi)]
      .map((match) => ({
        url: match[1],
        width: Number(match[2]),
      }))
      .sort((left, right) => right.width - left.width);

    for (const candidate of candidates) {
      const logoUrl = resolveIskibrisLogoUrl(candidate.url);
      if (logoUrl) return logoUrl;
    }
  }

  const src = /\bsrc=["']([^"']+)["']/i.exec(image)?.[1];
  return src ? resolveIskibrisLogoUrl(src) : null;
}

export function parseIskibrisListingCards(html: string): IskibrisSourceCard[] {
  const cards: IskibrisSourceCard[] = [];
  const cardPattern =
    /<a\b(?=[^>]*\bclass=["'][^"']*\bjob-card\b[^"']*["'])[^>]*\bhref=["']([^"']*\/jobs\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(cardPattern)) {
    const href = decodeHtml(match[1]);
    const block = match[2];
    const id = /\/jobs\/(\d+)/i.exec(href)?.[1];
    const title = normalizeText(
      /<p\b[^>]*class=["'][^"']*\bjob-card__title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(
        block,
      )?.[1] ?? "",
    );
    const companyName = normalizeText(
      /<span\b[^>]*class=["'][^"']*\bjob-card__subtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
        block,
      )?.[1] ?? "",
    );

    if (!id || !title || !companyName) continue;
    cards.push({ id, title, companyName, logoUrl: extractLogoUrl(block) });
  }

  return cards;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseDescription(job: Record<string, unknown>): string {
  const body = getString(job.body) ?? "";
  const turkishBody = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/i.exec(body)?.[1] ?? body;
  const bodyText = normalizeText(
    turkishBody.replace(/<img\b[^>]*>/gi, " ").replace(/data:image\/[^;]+;base64,[^"'\s]+/gi, " "),
  );
  if (bodyText) return bodyText;

  try {
    const openGraph = JSON.parse(getString(job.open_graph_tags) ?? "{}") as {
      description?: unknown;
    };
    return typeof openGraph.description === "string"
      ? normalizeText(openGraph.description)
      : "";
  } catch {
    return "";
  }
}

function getJobType(job: Record<string, unknown>): IskibrisSourceJob["jobType"] | null {
  const name = getString(job.employment_name);
  if (!name) return null;
  return jobTypeMap.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

function getDistrict(job: Record<string, unknown>): string | null {
  const place = getRecord(job.place);
  const placeName = getRecord(place?.name);
  const rawDistrict =
    getString(job.place_name_tr) ??
    getString(placeName?.name_tr) ??
    getString(job.city_name);

  if (!rawDistrict) return null;
  if (rawDistrict === "Gazimağusa" || rawDistrict === "Famagusta") return "Mağusa";
  if (rawDistrict === "Nicosia") return "Lefkoşa";
  if (rawDistrict === "Kyrenia") return "Girne";
  return supportedDistricts.has(rawDistrict) ? rawDistrict : null;
}

function getWorkplaceMode(
  job: Record<string, unknown>,
): IskibrisSourceJob["workplaceMode"] {
  const value = getString(job.workplace_mode) ?? getString(job.work_mode);
  if (!value) return null;

  const normalized = value.toLocaleLowerCase("tr");
  if (/remote|uzaktan/.test(normalized)) return "remote";
  if (/hybrid|hibrit/.test(normalized)) return "hybrid";
  if (/on.site|office|iş yerinde|yerinde/.test(normalized)) return "on_site";
  return null;
}

export function parseIskibrisJobDetail(
  html: string,
  expectedId: string,
  now = Date.now(),
): IskibrisSourceJob | null {
  const nextData = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
    html,
  )?.[1];
  if (!nextData) return null;

  let job: Record<string, unknown> | null;
  try {
    const parsed = getRecord(JSON.parse(nextData));
    const props = getRecord(parsed?.props);
    const pageProps = getRecord(props?.pageProps);
    job = getRecord(pageProps?.job);
  } catch {
    return null;
  }

  if (!job || String(job.id) !== expectedId) return null;

  const company = getRecord(job.company);
  const metadataText = getString(job.metadata);
  let metadata: Record<string, unknown> | null = null;
  if (metadataText) {
    try {
      metadata = getRecord(JSON.parse(metadataText));
    } catch {
      metadata = null;
    }
  }

  const isActive = job.active === 1 || job.active === true;
  const isPublished = job.is_published === 1 || job.is_published === true;
  const isArchived = job.archived === 1 || job.archived === true;
  const publishedAt = getDate(job.published_at) ?? getDate(job.startDate);
  const expiryCandidates = [
    getDate(job.endDate),
    getDate(metadata?.expires_at),
  ].filter((date): date is Date => date !== null);
  const expiresAt =
    expiryCandidates.length > 0
      ? new Date(Math.min(...expiryCandidates.map((date) => date.getTime())))
      : null;
  const title = getString(job.title);
  const companyName =
    getString(company?.name) ?? getString(job.company_name);
  const jobType = getJobType(job);

  if (
    !isActive ||
    !isPublished ||
    isArchived ||
    (job.deleted_at !== null && job.deleted_at !== undefined) ||
    job.status !== "active" ||
    !publishedAt ||
    publishedAt.getTime() > now + 5 * 60 * 1000 ||
    !expiresAt ||
    expiresAt.getTime() <= now ||
    !title ||
    !companyName ||
    !jobType
  ) {
    return null;
  }

  return {
    id: Number(job.id),
    title,
    companyName,
    companyLogoUrl:
    resolveIskibrisLogoUrl(
      getString(company?.logo) ??
        getString(job.company_logo) ??
        getString(company?.logo_url) ??
        "",
    ),
    description: parseDescription(job),
    jobType,
    district: getDistrict(job),
    publishedAt: publishedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    workplaceMode: getWorkplaceMode(job),
  };
}
