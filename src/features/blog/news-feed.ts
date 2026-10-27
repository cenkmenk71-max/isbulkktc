import "server-only";

import {
  deduplicateNewsArticles,
  extractArticleImageFromHtml,
  getEmploymentNewsScore,
  parseRssFeed,
  type FeedSourceConfig,
  type NewsArticle,
} from "./news-feed-parser";

export const LOCAL_NEWS_SOURCES: readonly FeedSourceConfig[] = [
  {
    name: "Yenidüzen",
    homepage: "https://www.yeniduzen.com",
    rssUrls: ["https://www.yeniduzen.com/rss/"],
  },
  {
    name: "Kıbrıs Time",
    homepage: "https://www.kibristime.com",
    rssUrls: ["https://www.kibristime.com/rss/"],
  },
  {
    name: "Kıbrıs Gazetesi",
    homepage: "https://kibrisgazetesi.com",
    rssUrls: ["https://kibrisgazetesi.com/feed/"],
  },
  {
    name: "BRTK",
    homepage: "https://brtk.net",
    rssUrls: ["https://brtk.net/feed/"],
  },
  {
    name: "Gündem Kıbrıs",
    homepage: "https://www.gundemkibris.com",
    rssUrls: ["https://www.gundemkibris.com/rss/"],
  },
  {
    name: "Kıbrıs Türk",
    homepage: "https://www.kibristurk.com",
    rssUrls: ["https://www.kibristurk.com/rss/"],
  },
] as const;

export type NewsFeedStatus = "current" | "stale" | "partial" | "unavailable";

export type NewsFeedResult = {
  articles: NewsArticle[];
  status: NewsFeedStatus;
  checkedAt: string;
};

const FEED_FRESHNESS_WINDOW_MS = 1000 * 60 * 60 * 48;
const FEED_HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 5;

export function getNewsFeedStatus(
  articles: NewsArticle[],
  failedFeeds: number,
  totalFeeds: number,
): NewsFeedStatus {
  if (articles.length === 0 || failedFeeds === totalFeeds) {
    return "unavailable";
  }

  if (failedFeeds > 0) {
    return "partial";
  }

  const newestArticle = articles.reduce((latest, article) => {
    const latestTime = new Date(latest.publishedAt).getTime();
    const candidateTime = new Date(article.publishedAt).getTime();
    return candidateTime > latestTime ? article : latest;
  }, articles[0]);

  const newestArticleAgeMs = Date.now() - new Date(newestArticle.publishedAt).getTime();
  return newestArticleAgeMs <= FEED_FRESHNESS_WINDOW_MS ? "current" : "stale";
}

async function loadLocalSourceFeed(source: FeedSourceConfig): Promise<NewsArticle[]> {
  const candidates = source.rssUrls && source.rssUrls.length > 0
    ? [...source.rssUrls]
    : source.rssUrl
      ? [source.rssUrl]
      : [];

  let lastError: unknown = null;

  for (const rssUrl of candidates) {
    try {
      const response = await fetch(rssUrl, {
        headers: {
          accept: "application/rss+xml, application/xml, text/xml, application/atom+xml",
          "user-agent": "Mozilla/5.0",
        },
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`${source.name} returned HTTP ${response.status}`);
      }

      const parsed = parseRssFeed(await response.text(), source.name);
      if (parsed.length === 0) {
        throw new Error(`${source.name} returned no parseable entries`);
      }

      return parsed;
    } catch (error) {
      lastError = error;
      console.warn(`Local feed failed for ${source.name}: ${rssUrl}`, error);
    }
  }

  throw lastError ?? new Error(`${source.name} has no valid RSS feed URLs`);
}

async function enrichArticleImages(articles: NewsArticle[]): Promise<NewsArticle[]> {
  const missingImageArticles = articles.filter((article) => !article.imageUrl);
  if (missingImageArticles.length === 0) {
    return articles;
  }

  const results = await Promise.allSettled(
    missingImageArticles.map(async (article) => {
      try {
        const response = await fetch(article.url, {
          headers: { accept: "text/html,application/xhtml+xml" },
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(7000),
        });

        if (!response.ok) {
          return { ...article, imageUrl: undefined };
        }

        const html = await response.text();
        const imageUrl = extractArticleImageFromHtml(html, article.url);
        return imageUrl ? { ...article, imageUrl } : article;
      } catch {
        return article;
      }
    }),
  );

  const resolvedByUrl = new Map<string, NewsArticle>();
  for (const article of articles) {
    resolvedByUrl.set(article.url, article);
  }

  for (const result of results) {
    if (result.status === "fulfilled") {
      resolvedByUrl.set(result.value.url, result.value);
    }
  }

  return [...resolvedByUrl.values()];
}

export async function getLatestNews(): Promise<NewsFeedResult> {
  const checkedAt = new Date().toISOString();
  const localResults = await Promise.allSettled(
    LOCAL_NEWS_SOURCES.map((source) => loadLocalSourceFeed(source)),
  );

  const localArticles: NewsArticle[] = [];
  let localFailures = 0;

  for (const result of localResults) {
    if (result.status === "fulfilled") {
      localArticles.push(...result.value);
    } else {
      localFailures += 1;
      console.error("Could not load a local KKTC news source.", result.reason);
    }
  }

  const candidateArticles: NewsArticle[] = localArticles;
  const totalChecks = LOCAL_NEWS_SOURCES.length;
  const failedChecks = localFailures;

  const recentArticles = candidateArticles.filter((article) => {
    const ageMs = Date.now() - new Date(article.publishedAt).getTime();
    return ageMs <= FEED_HISTORY_WINDOW_MS;
  });

  const prioritizedArticles = recentArticles
    .filter((article) => getEmploymentNewsScore(article.title) >= 2)
    .map((article) => ({
      article,
      score: getEmploymentNewsScore(article.title),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return new Date(right.article.publishedAt).getTime() - new Date(left.article.publishedAt).getTime();
    })
    .map(({ article }) => article);

  const broaderArticles = recentArticles
    .filter((article) => getEmploymentNewsScore(article.title) >= 1)
    .map((article) => article);

  const uniqueArticles = deduplicateNewsArticles([
    ...prioritizedArticles,
    ...broaderArticles,
  ])
    .map((article) => ({
      article,
      score: getEmploymentNewsScore(article.title),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return new Date(right.article.publishedAt).getTime() - new Date(left.article.publishedAt).getTime();
    })
    .map(({ article }) => article);

  const finalizedArticles = uniqueArticles.length >= 9
    ? uniqueArticles
    : deduplicateNewsArticles([...uniqueArticles, ...recentArticles]).slice(0, 9);

  const enrichedArticles = await enrichArticleImages(finalizedArticles);

  return {
    articles: enrichedArticles.slice(0, 9),
    status: getNewsFeedStatus(enrichedArticles, failedChecks, totalChecks),
    checkedAt,
  };
}
