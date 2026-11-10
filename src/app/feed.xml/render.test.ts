import assert from "node:assert/strict";
import test from "node:test";

import { escapeXml, renderFeed, type FeedItem } from "./render";

/**
 * The RSS feed used to stamp every `<pubDate>` from the item's edit date, so a
 * re-read of an old article looked like a brand-new item to aggregators. RSS 2.0
 * defines `<pubDate>` as "when the item was published" and `<lastBuildDate>` as
 * "the last time the content of the channel changed" — two different dates. The
 * route handler is `server-only`, so the distinction is asserted here.
 */

const base: Omit<FeedItem, "title" | "url"> = {
  description: "Kuzey Kıbrıs iş piyasası.",
  published: "2026-10-01",
  updated: "2026-10-01",
  category: "Rehber",
};

function item(overrides: Partial<FeedItem> & Pick<FeedItem, "title" | "url">): FeedItem {
  return { ...base, ...overrides };
}

test("item pubDate carries the publication date, not the edit date", () => {
  const xml = renderFeed({
    site: "https://isbulkktc.com",
    locale: "tr",
    items: [
      item({
        title: "Eski yazı",
        url: "https://isbulkktc.com/blog/eski-yazi",
        published: "2026-10-01",
        updated: "2026-11-09",
      }),
    ],
  });

  assert.match(xml, /<pubDate>Thu, 01 Oct 2026 00:00:00 GMT<\/pubDate>/);
  assert.doesNotMatch(xml, /<pubDate>.*09 Nov 2026/);
});

test("lastBuildDate is the newest edit date across items", () => {
  const xml = renderFeed({
    site: "https://isbulkktc.com",
    locale: "tr",
    items: [
      item({
        title: "A",
        url: "https://isbulkktc.com/blog/a",
        published: "2026-09-01",
        updated: "2026-10-05",
      }),
      item({
        title: "B",
        url: "https://isbulkktc.com/blog/b",
        published: "2026-10-20",
        updated: "2026-11-08",
      }),
    ],
  });

  assert.match(xml, /<lastBuildDate>Sun, 08 Nov 2026 00:00:00 GMT<\/lastBuildDate>/);
});

test("items are ordered newest publication first", () => {
  const xml = renderFeed({
    site: "https://isbulkktc.com",
    locale: "tr",
    items: [
      item({ title: "Eski", url: "https://isbulkktc.com/blog/eski", published: "2026-08-01" }),
      item({ title: "Yeni", url: "https://isbulkktc.com/blog/yeni", published: "2026-10-20" }),
    ],
  });

  assert.ok(xml.indexOf("Yeni") < xml.indexOf("Eski"));
});

test("feed declares its own URL and default locale", () => {
  const xml = renderFeed({ site: "https://isbulkktc.com", locale: "tr", items: [] });

  assert.match(
    xml,
    /<atom:link href="https:\/\/isbulkktc\.com\/feed\.xml" rel="self" type="application\/rss\+xml" \/>/,
  );
  assert.match(xml, /<language>tr<\/language>/);
});

test("escapeXml neutralises the five XML entities", () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), "a &amp; b &lt; c &gt; d &quot; e &apos; f");
});
