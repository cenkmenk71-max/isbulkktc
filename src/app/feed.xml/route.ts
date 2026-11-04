import { getAppBaseUrl } from "@/server/config/app-url";
import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import { routing } from "@/i18n/routing";

export const dynamic = "force-static";

/**
 * RSS feed for the site's own editorial content (guides and articles).
 *
 * This is the feed a reader can subscribe to and a crawler can poll for new
 * content — the opposite of the aggregator this site used to run, which pulled
 * other outlets' items in. It only ever lists pages the site publishes itself,
 * at their default-locale canonical URLs.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const baseUrl = getAppBaseUrl();
  const site = baseUrl.origin;
  const locale = routing.defaultLocale;

  const items = [
    ...getGuides(locale).map((guide) => ({
      title: guide.title,
      description: guide.description,
      url: `${site}/rehber/${guide.slug}`,
      date: guide.updated,
      category: "Rehber",
    })),
    ...getArticles(locale).map((article) => ({
      title: article.title,
      description: article.description,
      url: `${site}/blog/${article.slug}`,
      date: article.updated,
      category: article.category,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const lastBuild = items[0]?.date ?? new Date().toISOString().slice(0, 10);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>İşBul KKTC — Kariyer Rehberleri ve Yazıları</title>
    <link>${site}</link>
    <description>Kuzey Kıbrıs iş piyasası, kariyer rehberleri ve işveren yazıları.</description>
    <language>${locale}</language>
    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>
    <atom:link href="${site}/feed.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
