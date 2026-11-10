/**
 * RSS 2.0 rendering for `/feed.xml`, kept pure so it can be unit-tested.
 *
 * The route handler is `server-only` (it reads the app origin), which makes it
 * unimportable from a unit test. The date semantics it has to get right — item
 * `<pubDate>` is "when the item was published", channel `<lastBuildDate>` is
 * "the last time the content of the channel changed" — live here instead, where
 * a test can assert them without a server.
 */

export type FeedItem = {
  title: string;
  description: string;
  url: string;
  /** Publication date; RSS `<pubDate>` is defined as "when the item was published". */
  published: string;
  /** Edit date; only the newest one feeds the channel's `<lastBuildDate>`. */
  updated: string;
  category: string;
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderFeed({
  site,
  locale,
  items,
}: {
  site: string;
  locale: string;
  items: readonly FeedItem[];
}): string {
  const sorted = [...items].sort((a, b) =>
    b.published.localeCompare(a.published),
  );

  const lastBuild = sorted.reduce(
    (latest, item) => (item.updated > latest ? item.updated : latest),
    sorted[0]?.updated ?? new Date().toISOString().slice(0, 10),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>İşBul KKTC — Kariyer Rehberleri ve Yazıları</title>
    <link>${site}</link>
    <description>Kuzey Kıbrıs iş piyasası, kariyer rehberleri ve işveren yazıları.</description>
    <language>${locale}</language>
    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>
    <atom:link href="${site}/feed.xml" rel="self" type="application/rss+xml" />
${sorted
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.url}</link>
      <guid isPermaLink="true">${item.url}</guid>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
      <pubDate>${new Date(item.published).toUTCString()}</pubDate>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;
}
