import { getAppBaseUrl } from "@/server/config/app-url";
import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import { routing } from "@/i18n/routing";

import { renderFeed, type FeedItem } from "./render";

export const dynamic = "force-static";

/**
 * RSS feed for the site's own editorial content (guides and articles).
 *
 * This is the feed a reader can subscribe to and a crawler can poll for new
 * content — the opposite of the aggregator this site used to run, which pulled
 * other outlets' items in. It only ever lists pages the site publishes itself,
 * at their default-locale canonical URLs.
 */
export function GET() {
  const baseUrl = getAppBaseUrl();
  const site = baseUrl.origin;
  const locale = routing.defaultLocale;

  const items: FeedItem[] = [
    ...getGuides(locale).map((guide) => ({
      title: guide.title,
      description: guide.description,
      url: `${site}/rehber/${guide.slug}`,
      // A guide tracks a single authored date, so it is both its publication
      // and its edit date.
      published: guide.updated,
      updated: guide.updated,
      category: "Rehber",
    })),
    ...getArticles(locale).map((article) => ({
      title: article.title,
      description: article.description,
      url: `${site}/blog/${article.slug}`,
      // RSS `<pubDate>` is "when the item was published", so it takes the
      // article's own publication date; the edit date only feeds
      // `<lastBuildDate>`. Emitting `updated` here made an edited article
      // announce its edit date as its publication date.
      published: article.published,
      updated: article.updated,
      category: article.category,
    })),
  ];

  return new Response(renderFeed({ site, locale, items }), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
