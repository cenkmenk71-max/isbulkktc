export type NewsArticle = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
};

export type FeedSourceConfig = {
  name: string;
  homepage: string;
  rssUrl?: string;
  rssUrls?: readonly string[];
};

function getTagContent(xml: string, tagName: string): string | null {
  const match = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`,
    "i",
  ).exec(xml);
  return match?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPublisherSuffix(title: string, source: string): string {
  if (!source) return title;

  const normalizedSource = source.trim();
  if (!normalizedSource) return title;

  const sourceVariants = [
    normalizedSource,
    normalizedSource.replace(/\s+/g, " "),
    normalizedSource.replace(/[-–—|:]+$/g, "").trim(),
  ];

  for (const candidate of sourceVariants) {
    const suffixTokens = [
      ` - ${candidate}`,
      ` — ${candidate}`,
      ` | ${candidate}`,
      `: ${candidate}`,
      ` / ${candidate}`,
    ];

    for (const suffix of suffixTokens) {
      if (title.endsWith(suffix)) {
        return title.slice(0, -suffix.length).trim();
      }
    }
  }

  return title.trim();
}

function extractPublicationDate(itemXml: string): Date | null {
  const candidates = ["pubDate", "published", "updated", "dc:date", "pubdate"];

  for (const tagName of candidates) {
    const value = getTagContent(itemXml, tagName);
    if (!value) continue;
    const parsed = new Date(decodeXml(value));
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function extractLink(itemXml: string): string | null {
  const rawLink = getTagContent(itemXml, "link");
  if (rawLink) {
    try {
      return new URL(decodeXml(rawLink)).toString();
    } catch {
      // continue to other link patterns
    }
  }

  const hrefMatch = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(itemXml);
  if (hrefMatch?.[1]) {
    try {
      return new URL(decodeXml(hrefMatch[1])).toString();
    } catch {
      return null;
    }
  }

  return null;
}

function extractImageUrl(itemXml: string): string | null {
  const decodedXml = itemXml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

  const candidates = [
    /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<media:content\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<image\b[^>]*>([\s\S]*?)<\/image\s*>/i,
    /<img\b[^>]*src=["']([^"']+)["'][^>]*>/i,
    /<img\b[^>]*data-src=["']([^"']+)["'][^>]*>/i,
    /<img\b[^>]*srcset=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of candidates) {
    const match = pattern.exec(decodedXml);
    if (!match) continue;

    const rawValue = match[1] ?? match[0];
    const candidateValue = rawValue.includes("http") ? rawValue : rawValue.match(/https?:\/\/[^\s"']+/i)?.[0] ?? rawValue;

    try {
      const normalized = decodeXml(candidateValue).trim();
      if (!normalized) continue;
      const imageUrl = new URL(normalized, "https://example.com").toString();
      if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
        return imageUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseFeedEntries(
  xml: string,
  options: {
    allowedHostnames?: string[];
    defaultSource: string;
    now?: number;
  },
): NewsArticle[] {
  const items: NewsArticle[] = [];
  const allowedHostnames = options.allowedHostnames ?? [];
  const now = options.now ?? Date.now();
  const maxArticleAgeMs = 1000 * 60 * 60 * 24 * 7;

  const itemMatches = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi),
  ];

  for (const match of itemMatches) {
    const item = match[1];
    const titleValue = getTagContent(item, "title") ?? getTagContent(item, "headline");
    const linkValue = extractLink(item);
    const publishedAt = extractPublicationDate(item);
    const sourceValue = getTagContent(item, "source") ?? options.defaultSource;
    const imageValue = extractImageUrl(item);

    if (!titleValue || !linkValue || !publishedAt) continue;

    const title = decodeXml(titleValue);
    const url = new URL(linkValue);

    if (
      !title ||
      !Number.isFinite(publishedAt.getTime()) ||
      publishedAt.getTime() > now + 24 * 60 * 60 * 1000 ||
      publishedAt.getTime() < now - maxArticleAgeMs ||
      url.protocol !== "https:" ||
      (allowedHostnames.length > 0 && !allowedHostnames.includes(url.hostname))
    ) {
      continue;
    }

    const source = decodeXml(sourceValue || options.defaultSource);
    const publishedAtIso = publishedAt.toISOString();
    items.push({
      id: `${url.pathname}:${publishedAtIso}`,
      title: stripPublisherSuffix(title, source),
      source: source || options.defaultSource,
      publishedAt: publishedAtIso,
      url: url.toString(),
      ...(imageValue ? { imageUrl: new URL(imageValue, url).toString() } : {}),
    });
  }

  return items;
}

export function extractArticleImageFromHtml(
  html: string,
  articleUrl?: string,
): string | null {
  const patterns = [
    /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
    /<meta\b[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i,
    /<img\b[^>]*src=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;
    const rawValue = match[1] ?? "";
    const normalized = decodeXml(rawValue).trim();
    if (!normalized) continue;

    try {
      const resolved = new URL(normalized, articleUrl ?? "https://example.com");
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        return resolved.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function parseGoogleNewsFeed(
  xml: string,
  now = Date.now(),
): NewsArticle[] {
  return parseFeedEntries(xml, {
    allowedHostnames: ["news.google.com"],
    defaultSource: "Google News",
    now,
  });
}

export function parseRssFeed(
  xml: string,
  sourceName: string,
  now = Date.now(),
): NewsArticle[] {
  return parseFeedEntries(xml, {
    defaultSource: sourceName,
    now,
  });
}

export function getEmploymentNewsScore(title: string): number {
  const normalized = title.toLocaleLowerCase("tr");
  let score = 0;

  const highValuePatterns = [
    /istihdam|işe alım|iş ilan|işveren|çalışma hayatı|iş güvencesi|iş hukuku|işten çıkarma|asgari ücret|toplu sözleşme|sendika|grev|protokol|mevzuat|yasa|bakanlık|çalışma bakanlığı/i,
    /ücret|maaş|izin|prim|iş kazası|kıdem|emek|işçi|çalışan/i,
  ];

  const sectorPatterns = [
    /inşaat|turizm|lojistik|enerji|gıda|sanayi|tarım|teknoloji|yatırım|girişim|ekonomi|piyasa|büyüme|üretim|esnaf|sektör|maden/i,
  ];

  for (const pattern of highValuePatterns) {
    if (pattern.test(normalized)) {
      score += 2;
    }
  }

  for (const pattern of sectorPatterns) {
    if (pattern.test(normalized)) {
      score += 1;
    }
  }

  if (/uyum|görüşme|uzlaşı|açıklama|değişiklik|yenilenen|ihtiyaç|talep|risk|gelişim/i.test(normalized)) {
    score += 1;
  }

  return score;
}

export function isEmploymentNewsHeadline(title: string): boolean {
  return getEmploymentNewsScore(title) >= 2;
}

function getNewsEventKey(title: string): string | null {
  const normalized = title.toLocaleLowerCase("tr");
  if (/k[\s-]?pet|kıbrıs türk petrol|petrol[\s-]?iş/.test(normalized)) {
    return "k-pet";
  }
  if (/k[ıi]b[\s-]?tek|el[\s-]?sen/.test(normalized)) {
    return "kib-tek-el-sen";
  }
  if (/l[ıi]man[\s-]?sen|l[ıi]man(?:lar|larda)?/.test(normalized)) {
    return "port-labor";
  }
  if (/asgari ücret|minimum wage/.test(normalized)) {
    return "minimum-wage";
  }
  return null;
}

function getComparableTitle(title: string): Set<string> {
  const headline = title.split(/\s[-–—|]\s/)[0] ?? title;
  const ignoredWords = new Set([
    "ama",
    "bir",
    "bu",
    "ile",
    "için",
    "kadar",
    "sonra",
    "the",
    "and",
    "from",
  ]);
  return new Set(
    headline
      .toLocaleLowerCase("tr")
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((word) => !ignoredWords.has(word)) ?? [],
  );
}

export function deduplicateNewsArticles(
  articles: readonly NewsArticle[],
): NewsArticle[] {
  const sorted = [...articles].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime(),
  );
  const seenUrls = new Set<string>();
  const seenEventKeys = new Set<string>();
  const seenTitles: Set<string>[] = [];
  const unique: NewsArticle[] = [];

  for (const article of sorted) {
    const eventKey = getNewsEventKey(article.title);
    const titleTokens = getComparableTitle(article.title);
    const isSimilarHeadline = seenTitles.some((existingTokens) => {
      const overlap = [...titleTokens].filter((word) =>
        existingTokens.has(word),
      ).length;
      return (
        overlap >= 3 &&
        overlap / Math.min(titleTokens.size, existingTokens.size) >= 0.7
      );
    });

    if (
      seenUrls.has(article.url) ||
      (eventKey !== null && seenEventKeys.has(eventKey)) ||
      isSimilarHeadline
    ) {
      continue;
    }

    seenUrls.add(article.url);
    if (eventKey) seenEventKeys.add(eventKey);
    seenTitles.push(titleTokens);
    unique.push(article);
  }

  return unique;
}
