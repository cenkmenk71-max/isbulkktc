import { expect, test } from "@playwright/test";

test("public routes expose localized canonical and social metadata", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const publicRoutes = [
    {
      locale: "tr",
      path: "/tr",
      canonicalPath: "/",
      trPath: "/",
      enPath: "/en",
      title: "KKTC İş İlanları ve İş Bulma Platformu",
      description:
        "KKTC ve Kuzey Kıbrıs'ta güncel iş ilanları ve kariyer fırsatları. İlanları ilçe, çalışma türü ve çalışma düzenine göre arayın; İşBul KKTC ile iş bulun.",
    },
    {
      locale: "en",
      path: "/en",
      canonicalPath: "/en",
      trPath: "/",
      enPath: "/en",
      title: "Jobs in Northern Cyprus (TRNC) and Job Search Platform",
      description:
        "Current jobs, vacancies and career opportunities in Northern Cyprus (TRNC). Search listings by district, employment type and workplace, and find work with İşBul KKTC.",
    },
    {
      locale: "tr",
      path: "/tr/freelance",
      canonicalPath: "/freelance",
      trPath: "/freelance",
      enPath: "/en/freelance",
      title: "Kuzey Kıbrıs’ta serbest çalışma",
      description:
        "Serbest çalışma profilinizi mesleki başlık, konum ve becerilerinizle oluşturun. İşBul KKTC hesabınızla bilgilerinizi yönetin.",
    },
    {
      locale: "en",
      path: "/en/freelance",
      canonicalPath: "/en/freelance",
      trPath: "/freelance",
      enPath: "/en/freelance",
      title: "Independent work in Northern Cyprus",
      description:
        "Create a freelance profile with your professional headline, location, and skills. Manage your details with your İşBul KKTC account.",
    },
    {
      locale: "tr",
      path: "/tr/packages",
      canonicalPath: "/packages",
      trPath: "/packages",
      enPath: "/en/packages",
      title: "İşveren ilan hakları | Kuzey Kıbrıs",
      description:
        "İlan paketlerini inceleyin. Ödeme web sitesinde alınmaz; IBAN ve ödeme talimatı, paket görüşmesi sonrası e-posta veya WhatsApp gibi kanallardan özel olarak iletilir.",
    },
    {
      locale: "en",
      path: "/en/packages",
      canonicalPath: "/en/packages",
      trPath: "/packages",
      enPath: "/en/packages",
      title: "Employer job entitlements | Northern Cyprus",
      description:
        "Explore job packages. Payment is not collected on the website; IBAN details and payment instructions are shared privately by email or WhatsApp after discussing the package.",
    },
  ];

  for (const route of publicRoutes) {
    await page.goto(route.path);

    const siteOrigin = new URL(page.url()).origin;
    const absolutePath = (path: string) =>
      `${siteOrigin}${path === "/" ? "" : path}`;
    const canonicalUrl = absolutePath(route.canonicalPath);
    await expect(page.locator("html")).toHaveAttribute("lang", route.locale);
    await expect(page).toHaveTitle(`${route.title} · İşBul KKTC`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      route.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      canonicalUrl,
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="tr"]'),
    ).toHaveAttribute("href", absolutePath(route.trPath));
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", absolutePath(route.enPath));
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", absolutePath(route.trPath));
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonicalUrl,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      route.title,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "İşBul KKTC",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${siteOrigin}/images/og-cover.webp`,
    );
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
      "content",
      "1200",
    );
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
      "content",
      "630",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});

test("the social card stays inside the WhatsApp preview budget", async ({
  request,
  baseURL,
}) => {
  // WhatsApp drops an og:image larger than ~300 KB, so the card is a separate,
  // lighter asset rather than the 1.9 MB hero. Guard the size at the source.
  const response = await request.get(
    new URL("/images/og-cover.webp", baseURL).toString(),
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/webp");
  expect((await response.body()).length).toBeLessThan(300_000);
});

test("all advertised locales render with correct direction and complete SEO alternates", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const locales = [
    {
      code: "tr",
      prefix: "",
      title: "KKTC İş İlanları ve İş Bulma Platformu",
      direction: "ltr",
      directoryTitle: "Aradığınız şirketi bulun.",
      packageTitle: "İşe alım hakları, açık ve anlaşılır.",
      freelanceTitle: "Serbest çalışma deneyiminizi aday profilinizde düzenleyin.",
      socialImageAlt: "Girne Limanı ve Kuzey Kıbrıs kıyı şeridi",
    },
    {
      code: "en",
      prefix: "/en",
      title: "Jobs in Northern Cyprus (TRNC) and Job Search Platform",
      direction: "ltr",
      directoryTitle: "Find the company you need.",
      packageTitle: "Hiring rights, clearly defined.",
      freelanceTitle: "Organise your freelance experience in your candidate profile.",
      socialImageAlt: "Kyrenia Harbour and the Northern Cyprus coastline",
    },
    {
      code: "ru",
      prefix: "/ru",
      title: "Вакансии и работа на Северном Кипре (ТРСК)",
      direction: "ltr",
      directoryTitle: "Найдите нужную компанию.",
      packageTitle: "Права на найм — чётко и прозрачно.",
      freelanceTitle: "Укажите опыт самостоятельной работы в профиле кандидата.",
      socialImageAlt: "Порт Кирении и побережье Северного Кипра",
    },
    {
      code: "el",
      prefix: "/el",
      title: "Θέσεις εργασίας στη Βόρεια Κύπρο (ΤΔΒΚ)",
      direction: "ltr",
      directoryTitle: "Βρείτε την εταιρεία που χρειάζεστε.",
      packageTitle: "Σαφή δικαιώματα για τις προσλήψεις σας.",
      freelanceTitle: "Οργανώστε την εμπειρία ανεξάρτητης εργασίας στο προφίλ υποψηφίου σας.",
      socialImageAlt:
        "Το λιμάνι της Κερύνειας και η ακτογραμμή της Βόρειας Κύπρου",
    },
    {
      code: "fa",
      prefix: "/fa",
      title: "آگهی‌های استخدام و کار در قبرس شمالی",
      direction: "rtl",
      directoryTitle: "شرکت موردنیاز خود را پیدا کنید.",
      packageTitle: "حقوق استخدام، روشن و مشخص.",
      freelanceTitle: "تجربه کار مستقل را در پروفایل متقاضی خود سامان دهید.",
      socialImageAlt: "بندر گیرنه و خط ساحلی قبرس شمالی",
    },
    {
      code: "de",
      prefix: "/de",
      title: "Stellenangebote in Nordzypern (TRNC) und Jobbörse",
      direction: "ltr",
      directoryTitle: "Finden Sie das passende Unternehmen.",
      packageTitle: "Klare Rechte für Ihre Personalsuche.",
      freelanceTitle: "Ordnen Sie Ihre selbstständige Berufserfahrung in Ihrem Bewerberprofil.",
      socialImageAlt: "Der Hafen von Kyrenia und die Küste Nordzyperns",
    },
  ];

  for (const locale of locales) {
    await page.goto(locale.prefix || "/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", locale.code);
    await expect(page.locator("html")).toHaveAttribute("dir", locale.direction);
    await expect(page).toHaveTitle(`${locale.title} · İşBul KKTC`);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      locale.socialImageAlt,
    );
    await expect(
      page.locator(`link[rel="alternate"][hreflang="${locale.code}"]`),
    ).toHaveAttribute(
      "href",
      `${new URL(page.url()).origin}${locale.prefix}`,
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", new URL(page.url()).origin);

    await page.goto(`${locale.prefix}/companies`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: locale.directoryTitle }),
    ).toBeVisible();
    await page.goto(`${locale.prefix}/packages`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: locale.packageTitle }),
    ).toBeVisible();
    await page.goto(`${locale.prefix}/freelance`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: locale.freelanceTitle }),
    ).toBeVisible();

    if (locale.code === "fa") {
      await page.goto("/fa/register", { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByLabel("ایمیل")).toBeVisible();
      await expect(page.getByLabel("گذرواژه", { exact: true })).toBeVisible();
      await expect(page.getByLabel("ایمیل")).toHaveCSS("direction", "ltr");
      await page.setViewportSize({ width: 320, height: 844 });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
  }
});

test("account pages are excluded from indexing without blocking crawlers", async ({
  page,
}) => {
  // Six navigations plus a robots.txt fetch. Measured here at ~24s, so the 60s
  // default leaves thin headroom on a loaded runner; budgeted like the other
  // multi-route SEO sweeps in this file.
  test.setTimeout(120_000);
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/en/login",
    "/en/register",
    "/en/forgot-password",
  ]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  }

  const siteOrigin = new URL(page.url()).origin;
  const robotsResponse = await page.request.get("/robots.txt");
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain(`Sitemap: ${siteOrigin}/sitemap.xml`);
  // Account pages must rely on their `noindex` meta tag, not a Disallow: a
  // disallowed URL is never fetched, so the tag is never seen and the URL can
  // still be indexed from inbound links. Only non-HTML infrastructure (route
  // handlers that cannot carry a meta tag) may be disallowed.
  for (const pagePath of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/admin",
    "/profile",
    "/company/dashboard",
    "/company/new",
  ]) {
    expect(robots).not.toContain(`Disallow: ${pagePath}`);
  }
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toContain("Disallow: /auth/");
  // Cloudflare's email-obfuscation links resolve under `/cdn-cgi/`, which the
  // origin answers with 404; the prefix must be disallowed so crawls do not
  // spend budget on dead infrastructure URLs.
  expect(robots).toContain("Disallow: /cdn-cgi/");

  // The browser and search engines request these exact root paths by
  // convention; a 404 here is a crawl error and a blank tab icon.
  for (const assetPath of ["/favicon.ico", "/apple-touch-icon.png"]) {
    const asset = await page.request.get(assetPath);
    expect(asset.status(), `${assetPath} must be served`).toBe(200);
  }

  // RFC 9116 security.txt must be reachable at the well-known location, carry a
  // machine-readable contact, and not have an `Expires` in the past.
  const securityResponse = await page.request.get("/.well-known/security.txt");
  expect(securityResponse.ok()).toBe(true);
  expect(securityResponse.headers()["content-type"]).toContain("text/plain");
  const securityTxt = await securityResponse.text();
  expect(securityTxt).toMatch(/^Contact: mailto:\S+@\S+$/m);
  expect(securityTxt).toContain(`Canonical: ${siteOrigin}/.well-known/security.txt`);
  const expiresMatch = securityTxt.match(/^Expires: (.+)$/m);
  expect(expiresMatch).not.toBeNull();
  expect(new Date(expiresMatch![1]).getTime()).toBeGreaterThan(Date.now());

  const sitemapResponse = await page.request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  for (const path of [
    "/",
    "/en",
    "/ru",
    "/el",
    "/fa",
    "/de",
    "/freelance",
    "/en/freelance",
    "/packages",
    "/en/packages",
  ]) {
    expect(sitemap).toContain(`<loc>${siteOrigin}${path}</loc>`);
  }
  expect(sitemap).toContain('hreflang="x-default"');
  expect(sitemap).not.toMatch(/<loc>[^<]*(login|register|forgot-password|dashboard|company\/new)/);

  // Vacancy detail pages are the bulk of the indexable surface, so the sitemap
  // must advertise them — each once, at its Turkish canonical URL — instead of
  // stopping at the eleven static routes.
  await page.goto("/jobs", { waitUntil: "domcontentloaded" });
  const jobPaths = [
    ...new Set(
      await page
        .locator('a[href^="/jobs/"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href") ?? ""),
        ),
    ),
  ].filter((href) => /^\/jobs\/[a-z0-9-]+$/.test(href));

  if (jobPaths.length > 0) {
    for (const path of jobPaths) {
      expect(sitemap).toContain(`<loc>${siteOrigin}${path}</loc>`);
    }
    expect(sitemap).toMatch(/<lastmod>/);
    // Six prefixes over one Turkish text is duplicate content, not coverage.
    expect(sitemap).not.toMatch(
      new RegExp(`<loc>${siteOrigin}/(en|ru|el|fa|de)/jobs/`),
    );

    // `<lastmod>` is only useful while it stays verifiable against the page.
    // A vacancy's date is; a build timestamp is not. So the two listing routes
    // must carry the newest published vacancy date (proving it is derived from
    // data, not from the build) and the pages with no such data must omit it.
    const lastmodByLoc = new Map<string, string>();
    for (const block of sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)) {
      const loc = block[0].match(/<loc>([^<]+)<\/loc>/)?.[1];
      const lastmod = block[0].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      if (loc && lastmod) lastmodByLoc.set(loc, lastmod);
    }

    const vacancyLocs = [...lastmodByLoc.keys()].filter((loc) =>
      loc.includes("/jobs/"),
    );
    expect(vacancyLocs.length).toBeGreaterThan(0);

    const newestVacancy = Math.max(
      ...vacancyLocs.map((loc) => Date.parse(lastmodByLoc.get(loc)!)),
    );

    for (const path of ["/", "/en", "/de", "/jobs", "/en/jobs", "/de/jobs"]) {
      const lastmod = lastmodByLoc.get(`${siteOrigin}${path}`);
      expect(lastmod, `${path} renders listings and must carry <lastmod>`).toBeDefined();
      expect(Date.parse(lastmod!)).toBe(newestVacancy);
    }

    for (const path of [
      "/about",
      "/contact",
      "/privacy",
      "/cookies",
      "/terms",
      "/freelance",
      "/packages",
      "/blog",
    ]) {
      expect(
        lastmodByLoc.has(`${siteOrigin}${path}`),
        `${path} has no verifiable modification date and must omit <lastmod>`,
      ).toBe(false);
    }
  }
});

test("the 404 page serves one noindex tag and the light social card", async ({
  page,
}) => {
  await page.goto("/this-page-does-not-exist", { waitUntil: "domcontentloaded" });

  // Next injects its own `noindex` for a 404; a layout that also asserts
  // `index, follow` leaves the response with two contradictory robots metas.
  await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  // The 404 inherits the locale layout's social card, so it must advertise the
  // same 1200x630 og-cover.webp as every other page instead of the ~1.9 MB hero.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${new URL(page.url()).origin}/images/og-cover.webp`,
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
    "content",
    "630",
  );
});

test("the sitelinks search box targets the parameter the jobs page reads", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? "").join("\n"),
    );
  expect(structuredData).toContain('"@type":"SearchAction"');
  // The jobs page parses `?query=`, so a `?q=` template lands on the
  // unfiltered listing and the search box never works.
  expect(structuredData).toContain(
    `${new URL(page.url()).origin}/jobs?query={search_term_string}`,
  );
  expect(structuredData).not.toContain("/jobs?q=");
});

test("localized vacancy URLs canonicalise to the Turkish listing", async ({
  page,
}) => {
  const slug = "source-iskibris-garson";

  await page.goto(`/en/jobs/${slug}`, { waitUntil: "domcontentloaded" });
  const siteOrigin = new URL(page.url()).origin;
  const canonicalUrl = `${siteOrigin}/jobs/${slug}`;

  // The page text is Turkish under every prefix, so only the default-locale URL
  // may claim the content; the others point their canonical at it.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonicalUrl,
  );
  // Advertised alternates would offer Google six identical pages to choose from.
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);

  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? "").join("\n"),
    );
  expect(structuredData).toContain('"@type":"JobPosting"');
  // Google Jobs must be pointed at the same URL the page declares canonical.
  expect(structuredData).toContain(`"url":"${canonicalUrl}"`);

  // `dateModified` must be present and never precede `datePosted`, which Google
  // Jobs rejects. The listing is an imported one, so its value comes from the
  // provenance row rather than the platform trigger.
  const posting = JSON.parse(
    structuredData
      .split("\n")
      .find((line) => line.includes('"@type":"JobPosting"')) ?? "{}",
  ) as { datePosted?: string; dateModified?: string };
  expect(posting.dateModified).toBeTruthy();
  expect(Date.parse(posting.dateModified as string)).toBeGreaterThanOrEqual(
    Date.parse(posting.datePosted as string),
  );

  await page.goto(`/jobs/${slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    canonicalUrl,
  );
});

test("filtered job searches that match nothing are not indexable", async ({
  page,
}) => {
  // A search that returns no results still answers 200 with a full page shell,
  // so without a `noindex` it is a soft 404 that competes with the real listing.
  for (const search of ["?query=zzzznomatchzzz", "?district=zzz-not-a-district"]) {
    await page.goto(`/jobs${search}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('meta[name="robots"]'),
      `${search} renders an empty result and must not be indexed`,
    ).toHaveAttribute("content", /noindex/);
  }

  // The unfiltered listing is the canonical, indexable page.
  await page.goto("/jobs", { waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("a job page number past the last page is a hard 404", async ({ page }) => {
  const listing = await page.request.get("/jobs");
  expect(listing.ok()).toBe(true);

  // `?page=N` beyond the last page would otherwise serve the final page again
  // under a fresh, never-linked URL (a soft 404 that the canonical to /jobs
  // cannot rescue). It must be a genuine 404.
  const outOfRange = await page.request.get("/jobs?page=1000");
  expect(outOfRange.status()).toBe(404);

  // A real page number keeps working.
  const firstPage = await page.request.get("/jobs?page=1");
  expect(firstPage.status()).toBe(200);
});

test("an out-of-range page inside a filter is also a hard 404", async ({
  page,
}) => {
  // The RPC clamps `_page` to the last page *of the filtered set*, so a
  // filter that matches one page of results still answers 200 for `?page=50`
  // unless the render path rejects it. The empty-result filter (`noindex`) and
  // the out-of-range page (`404`) are separate guards and both must hold when
  // they combine.
  const filtered = await page.request.get("/jobs?district=Girne");
  expect(filtered.ok()).toBe(true);

  const outOfRange = await page.request.get("/jobs?district=Girne&page=50");
  expect(outOfRange.status()).toBe(404);

  const firstPage = await page.request.get("/jobs?district=Girne&page=1");
  expect(firstPage.status()).toBe(200);
});

test("hreflang alternates are declared once, in the HTML head", async ({
  page,
}) => {
  const response = await page.request.get("/jobs");
  expect(response.ok()).toBe(true);

  // The middleware used to also emit a `Link` response header advertising every
  // locale variant — including for paths that canonicalise to one locale, and
  // for 404s. The HTML head is the single source of truth.
  const linkHeader = response.headers()["link"] ?? "";
  expect(linkHeader).not.toContain("hreflang");
});

test("every vacancy URL in the sitemap actually resolves", async ({
  request,
}) => {
  test.setTimeout(180_000);

  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();

  const vacancyPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((loc) => loc.includes("/jobs/"))
    .map((loc) => new URL(loc).pathname);

  // The imported catalogue changes on every refresh, so this is the one place a
  // stale entry could ship: the sitemap is generated per request (see
  // `src/app/sitemap.ts`), so a vacancy it advertises must resolve right now.
  // Google drops a sitemap that advertises URLs which do not resolve, so the
  // sitemap must never carry a vacancy URL that 404s.
  expect(vacancyPaths.length).toBeGreaterThan(0);

  for (const path of vacancyPaths) {
    const response = await request.get(path);
    expect(
      response.status(),
      `${path} is advertised in the sitemap but answers ${response.status()}`,
    ).toBe(200);
  }
});


test("district landing pages are self-canonical, interlinked, and agree with the sitemap", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  const districts = [
    { slug: "lefkosa", tr: "Lefkoşa", en: "Nicosia" },
    { slug: "magusa", tr: "Mağusa", en: "Famagusta" },
    { slug: "girne", tr: "Girne", en: "Kyrenia" },
    { slug: "guzelyurt", tr: "Güzelyurt", en: "Morphou" },
    { slug: "iskele", tr: "İskele", en: "Trikomo" },
    { slug: "lefke", tr: "Lefke", en: "Lefka" },
  ];

  const sitemap = await (await request.get("/sitemap.xml")).text();

  for (const district of districts) {
    // The Turkish page names the district and carries its own canonical. It
    // answers 200 whether or not it has vacancies: an empty landing renders the
    // empty state rather than 404, so a shared link keeps working.
    const response = await request.get(`/is-ilanlari/${district.slug}`);
    expect(response.status(), `${district.slug} must resolve`).toBe(200);

    await page.goto(`/is-ilanlari/${district.slug}`, {
      waitUntil: "domcontentloaded",
    });
    const siteOrigin = new URL(page.url()).origin;
    await expect(page).toHaveTitle(
      new RegExp(`${district.tr} İş İlanları`),
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteOrigin}/is-ilanlari/${district.slug}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      district.tr,
    );

    // A landing with no vacancy is a soft 404 when it claims `index, follow`,
    // so it must be `noindex` — and then the sitemap must not advertise it: a
    // sitemap entry that answers `noindex` is the contradiction our own
    // `scripts/verify-indexing.mjs` fails on. The two signals must always
    // agree, whichever way the seed happens to fall.
    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent =
      (await robotsMeta.count()) > 0
        ? await robotsMeta.first().getAttribute("content")
        : null;
    const isNoIndex = robotsContent !== null && /noindex/.test(robotsContent);
    const listedInSitemap = sitemap.includes(
      `<loc>${siteOrigin}/is-ilanlari/${district.slug}</loc>`,
    );
    expect(
      isNoIndex,
      `${district.slug}: sitemap and noindex disagree (robots="${robotsContent}", listed=${listedInSitemap})`,
    ).toBe(!listedInSitemap);

    // Cross-links to the other districts are real anchors, so crawlers reach
    // every district page from any one of them — including the `noindex` ones,
    // which stay `follow` and so must remain reachable to be rediscovered once
    // a vacancy arrives.
    for (const other of districts) {
      if (other.slug === district.slug) continue;
      await expect(
        page.locator(`a[href="/is-ilanlari/${other.slug}"]`),
      ).toHaveCount(1);
    }
  }

  // The English page localizes the district name and its canonical.
  await page.goto("/en/is-ilanlari/girne", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Jobs and Vacancies in Kyrenia/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${new URL(page.url()).origin}/en/is-ilanlari/girne`,
  );
});

test("an unknown district slug is a hard 404", async ({ request }) => {
  const response = await request.get("/is-ilanlari/not-a-district");
  expect(response.status()).toBe(404);
});


test("employment-type landing pages are self-canonical, interlinked, and agree with the sitemap", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  const types = [
    { slug: "tam-zamanli", tr: "Tam zamanlı" },
    { slug: "yari-zamanli", tr: "Yarı zamanlı" },
    { slug: "sozlesmeli", tr: "Sözleşmeli" },
    { slug: "gecici", tr: "Geçici" },
    { slug: "staj", tr: "Staj" },
    { slug: "serbest-calisma", tr: "Serbest çalışma" },
  ];

  const sitemap = await (await request.get("/sitemap.xml")).text();

  for (const type of types) {
    const response = await request.get(`/is-turleri/${type.slug}`);
    expect(response.status(), `${type.slug} must resolve`).toBe(200);

    await page.goto(`/is-turleri/${type.slug}`, {
      waitUntil: "domcontentloaded",
    });
    const siteOrigin = new URL(page.url()).origin;
    await expect(page).toHaveTitle(
      new RegExp(`${type.tr} İş İlanları`),
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteOrigin}/is-turleri/${type.slug}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      type.tr,
    );

    // Same contract as the district pages: `noindex` if and only if the sitemap
    // omits the URL, so a type with no live vacancy is neither indexed as a
    // Soft 404 nor advertised as a contradiction.
    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent =
      (await robotsMeta.count()) > 0
        ? await robotsMeta.first().getAttribute("content")
        : null;
    const isNoIndex = robotsContent !== null && /noindex/.test(robotsContent);
    const listedInSitemap = sitemap.includes(
      `<loc>${siteOrigin}/is-turleri/${type.slug}</loc>`,
    );
    expect(
      isNoIndex,
      `${type.slug}: sitemap and noindex disagree (robots="${robotsContent}", listed=${listedInSitemap})`,
    ).toBe(!listedInSitemap);

    // Cross-links to the other types are real anchors.
    for (const other of types) {
      if (other.slug === type.slug) continue;
      await expect(
        page.locator(`a[href="/is-turleri/${other.slug}"]`),
      ).toHaveCount(1);
    }
  }
});

test("an unknown employment-type slug is a hard 404", async ({ request }) => {
  const response = await request.get("/is-turleri/not-a-type");
  expect(response.status()).toBe(404);
});


test("editorial guides are indexable, self-canonical and carry Article data", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  const guides = [
    { slug: "kktc-is-bulma-rehberi", tr: "KKTC'de İş Bulma Rehberi" },
    { slug: "kktc-cv-hazirlama-rehberi", tr: "KKTC İçin CV Hazırlama Rehberi" },
    { slug: "kktc-calisma-izni-ve-haklar", tr: "KKTC'de Çalışma İzni ve Çalışan Hakları" },
  ];

  // The index lists every guide as a real link.
  await page.goto("/rehber", { waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  for (const guide of guides) {
    await expect(page.locator(`a[href="/rehber/${guide.slug}"]`)).toHaveCount(1);
  }

  for (const guide of guides) {
    const response = await request.get(`/rehber/${guide.slug}`);
    expect(response.status(), `${guide.slug} must resolve`).toBe(200);

    await page.goto(`/rehber/${guide.slug}`, { waitUntil: "domcontentloaded" });
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveTitle(new RegExp(guide.tr.slice(0, 24)));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/rehber/${guide.slug}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      guide.tr.slice(0, 20),
    );
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

    // The guide declares itself as an Article, authored by the site.
    const structuredData = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.textContent ?? "").join("\n"),
      );
    expect(structuredData).toContain('"@type":"Article"');
    expect(structuredData).toContain(`${origin}/rehber/${guide.slug}`);
  }

  // A guide in another locale localizes its own canonical.
  await page.goto("/en/rehber/finding-a-job-in-northern-cyprus", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${new URL(page.url()).origin}/en/rehber/finding-a-job-in-northern-cyprus`,
  );

  // Every guide page is advertised in the sitemap.
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const sitemapOrigin = new URL(page.url()).origin;
  for (const guide of guides) {
    expect(sitemap).toContain(`<loc>${sitemapOrigin}/rehber/${guide.slug}</loc>`);
  }
});

test("an unknown guide slug is a hard 404", async ({ request }) => {
  const response = await request.get("/rehber/not-a-guide");
  expect(response.status()).toBe(404);
});


test("the FAQ page is indexable and carries FAQPage structured data", async ({
  page,
  request,
}) => {
  const response = await request.get("/sss");
  expect(response.status()).toBe(200);

  await page.goto("/sss", { waitUntil: "domcontentloaded" });
  const origin = new URL(page.url()).origin;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/sss`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent ?? "").join("\n"),
    );
  expect(structuredData).toContain('"@type":"FAQPage"');
  expect(structuredData).toContain(`${origin}/sss`);

  // The page renders the questions visibly, not only in the graph.
  await expect(page.locator(".faq-item").first()).toBeVisible();

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${origin}/sss</loc>`);
});

test("the RSS feed lists only the site's own editorial pages", async ({
  request,
}) => {
  const response = await request.get("/feed.xml");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("rss+xml");

  const feed = await response.text();
  expect(feed).toContain("<rss");
  expect(feed).toContain("/rehber/");
  expect(feed).toContain("/blog/");
  // The feed must never point at another outlet: it lists our own pages only.
  expect(feed).not.toContain("yeniduzen.com");
  expect(feed).not.toContain("kibrisgazetesi.com");
});
