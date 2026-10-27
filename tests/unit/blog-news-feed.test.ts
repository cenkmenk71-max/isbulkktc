import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateNewsArticles,
  extractArticleImageFromHtml,
  getEmploymentNewsScore,
  isEmploymentNewsHeadline,
  parseGoogleNewsFeed,
  parseRssFeed,
} from "../../src/features/blog/news-feed-parser";

const now = Date.parse("2026-10-18T06:00:00.000Z");

test("parses and decodes Google News RSS headlines with their publisher", () => {
  const articles = parseGoogleNewsFeed(
    `<rss><channel>
      <item>
        <title><![CDATA[KKTC’de istihdam &amp; kariyer]]></title>
        <link>https://news.google.com/rss/articles/example?oc=5</link>
        <pubDate>Sun, 18 Oct 2026 05:00:00 GMT</pubDate>
        <source url="https://publisher.example">Yerel &amp; Güncel</source>
      </item>
    </channel></rss>`,
    now,
  );

  assert.deepEqual(articles, [
    {
      id: "/rss/articles/example:2026-10-18T05:00:00.000Z",
      title: "KKTC’de istihdam & kariyer",
      source: "Yerel & Güncel",
      publishedAt: "2026-10-18T05:00:00.000Z",
      url: "https://news.google.com/rss/articles/example?oc=5",
    },
  ]);
});

test("strips publisher suffixes from article titles while preserving the source metadata", () => {
  const articles = parseGoogleNewsFeed(
    `<rss><channel>
      <item>
        <title>Grev sona erdi, işçiler işbaşı yaptı - Kıbrıs Manşet</title>
        <link>https://news.google.com/rss/articles/example-source-strip?oc=5</link>
        <pubDate>Sun, 18 Oct 2026 05:00:00 GMT</pubDate>
        <source url="https://kibrismanset.com">Kıbrıs Manşet</source>
      </item>
    </channel></rss>`,
    now,
  );

  assert.deepEqual(articles, [
    {
      id: "/rss/articles/example-source-strip:2026-10-18T05:00:00.000Z",
      title: "Grev sona erdi, işçiler işbaşı yaptı",
      source: "Kıbrıs Manşet",
      publishedAt: "2026-10-18T05:00:00.000Z",
      url: "https://news.google.com/rss/articles/example-source-strip?oc=5",
    },
  ]);
});

test("parses local RSS feed entries from trusted KKTC sources", () => {
  const articles = parseRssFeed(
    `<rss><channel>
      <item>
        <title>İşçiler için yeni toplu sözleşme görüşmeleri başladı | Kıbrıs Gazetesi</title>
        <link>https://www.kibrisgazetesi.com/haber/isciler-icin-yeni-toplu-sozlesme-gorusmeleri-basladi/12345</link>
        <pubDate>Sun, 18 Oct 2026 05:00:00 GMT</pubDate>
      </item>
    </channel></rss>`,
    "Kıbrıs Gazetesi",
    now,
  );

  assert.deepEqual(articles, [
    {
      id: "/haber/isciler-icin-yeni-toplu-sozlesme-gorusmeleri-basladi/12345:2026-10-18T05:00:00.000Z",
      title: "İşçiler için yeni toplu sözleşme görüşmeleri başladı",
      source: "Kıbrıs Gazetesi",
      publishedAt: "2026-10-18T05:00:00.000Z",
      url: "https://www.kibrisgazetesi.com/haber/isciler-icin-yeni-toplu-sozlesme-gorusmeleri-basladi/12345",
    },
  ]);
});

test("extracts the real article image from OG tags when the page is available", () => {
  const imageUrl = extractArticleImageFromHtml(
    `<!doctype html><html><head><meta property="og:image" content="https://www.yeniduzen.com/images/real-news.jpg" /></head></html>`,
    "https://www.yeniduzen.com/haber/yeniden-geliyor",
  );

  assert.equal(imageUrl, "https://www.yeniduzen.com/images/real-news.jpg");
});

test("extracts the real image from escaped HTML inside the RSS description field", () => {
  const articles = parseRssFeed(
    `<rss><channel>
      <item>
        <title>Merit International’dan Sevgi Evi’nde çocuklara neşe dolu bir gün</title>
        <link>https://www.yeniduzen.com/merit-internationaldan-sevgi-evinde-cocuklara-nese-dolu-bir-gun-200950h.htm</link>
        <pubDate>Mon, 26 Oct 2026 11:47:00 +0200</pubDate>
        <description>&lt;table border=&quot;0&quot; cellpadding=&quot;2&quot; cellspacing=&quot;7&quot;&gt;&lt;tr&gt;&lt;td&gt;&lt;img src=&quot;https://d.yeniduzen.com/news/153634.jpg&quot; alt=&quot;Merit International&quot; /&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</description>
      </item>
    </channel></rss>`,
    "Yenidüzen",
    Date.parse("2026-10-26T12:00:00.000Z"),
  );

  assert.equal(articles[0]?.imageUrl, "https://d.yeniduzen.com/news/153634.jpg");
});

test("rejects insecure, non-Google, malformed and future-dated feed entries", () => {
  const articles = parseGoogleNewsFeed(
    `<rss><channel>
      <item>
        <title>Insecure link</title>
        <link>http://news.google.com/article</link>
        <pubDate>Sun, 18 Oct 2026 05:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Untrusted publisher link</title>
        <link>https://example.com/article</link>
        <pubDate>Sun, 18 Oct 2026 05:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Invalid date</title>
        <link>https://news.google.com/article</link>
        <pubDate>not-a-date</pubDate>
      </item>
      <item>
        <title>Future article</title>
        <link>https://news.google.com/article/future</link>
        <pubDate>Mon, 19 Oct 2026 12:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Missing publication date</title>
        <link>https://news.google.com/article/missing-date</link>
      </item>
    </channel></rss>`,
    now,
  );

  assert.deepEqual(articles, []);
});

test("keeps employment headlines and excludes unrelated local news", () => {
  assert.equal(
    isEmploymentNewsHeadline("Süresiz grev uzlaşı sağlanana kadar sürecek"),
    true,
  );
  assert.equal(
    isEmploymentNewsHeadline("KKTC’de yeni istihdam fırsatları açıklandı"),
    true,
  );
  assert.equal(
    isEmploymentNewsHeadline("Çalışma Bakanlığı, yeni iş güvenliği protokolünü açıkladı"),
    true,
  );
  assert.ok(getEmploymentNewsScore("Çalışma Bakanlığı, yeni mevzuat değişikliği açıkladı") >= 2);
  assert.equal(
    isEmploymentNewsHeadline("Miss Kuzey Kıbrıs 2026 güzeli belli oldu"),
    false,
  );
});

test("keeps only the most recent five-day local employment headlines", () => {
  const recent = parseRssFeed(
    `<rss><channel>
      <item>
        <title>Çalışma mevzuatı değişiyor: yeni protokol onaylandı</title>
        <link>https://www.yeniduzen.com/yeni-protokol</link>
        <pubDate>Mon, 19 Oct 2026 09:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Geçmişte kalmış iş ilanı haberi</title>
        <link>https://www.yeniduzen.com/eski-is-ilani</link>
        <pubDate>Mon, 05 Oct 2026 09:00:00 GMT</pubDate>
      </item>
    </channel></rss>`,
    "Yenidüzen",
    Date.parse("2026-10-19T12:00:00.000Z"),
  );

  assert.equal(recent.length, 1);
  assert.match(recent[0].title, /çalışma|protokol/i);
});

test("deduplicates syndicated reports about the same local work event", () => {
  const articles = deduplicateNewsArticles([
    {
      id: "older",
      title: "K-PET grevi uzlaşı sağlanana kadar sürecek - Kıbrıs Manşet",
      source: "Kıbrıs Manşet",
      publishedAt: "2026-10-17T05:00:00.000Z",
      url: "https://news.google.com/older",
    },
    {
      id: "newer",
      title: "K-PET’te grev sona erdi, işçiler işbaşı yaptı - Kıbrıs Gerçek",
      source: "Kıbrıs Gerçek",
      publishedAt: "2026-10-18T05:00:00.000Z",
      url: "https://news.google.com/newer",
    },
    {
      id: "other",
      title: "Yeni istihdam ve meslek eğitimi programı açıklandı",
      source: "Yerel Haber",
      publishedAt: "2026-10-16T05:00:00.000Z",
      url: "https://news.google.com/other",
    },
  ]);

  assert.deepEqual(
    articles.map((article) => article.id),
    ["newer", "other"],
  );
});

test("deduplicates repeated union and port strike coverage by event", () => {
  const articles = deduplicateNewsArticles([
    {
      id: "kibtek-old",
      title: "KIB-TEK grevi sürüyor - Yerel Haber",
      source: "Yerel Haber",
      publishedAt: "2026-10-16T05:00:00.000Z",
      url: "https://news.google.com/kibtek-old",
    },
    {
      id: "elsen-new",
      title: "EL-SEN ile KIB-TEK uzlaşıya vardı - Yerel Haber",
      source: "Yerel Haber",
      publishedAt: "2026-10-17T05:00:00.000Z",
      url: "https://news.google.com/elsen-new",
    },
    {
      id: "port-old",
      title: "Liman-Sen limanlarda eylem hazırlığında - Yerel Haber",
      source: "Yerel Haber",
      publishedAt: "2026-10-15T05:00:00.000Z",
      url: "https://news.google.com/port-old",
    },
    {
      id: "port-new",
      title: "Liman-Sen grev uyarısı yaptı - Yerel Haber",
      source: "Yerel Haber",
      publishedAt: "2026-10-18T05:00:00.000Z",
      url: "https://news.google.com/port-new",
    },
  ]);

  assert.deepEqual(
    articles.map((article) => article.id),
    ["port-new", "elsen-new"],
  );
});
