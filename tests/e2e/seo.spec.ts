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
      title: "Kuzey Kıbrıs’ta iş ve kariyer",
      description:
        "Mesleki profilinizi oluşturun, becerilerinizi yönetin ve Kuzey Kıbrıs’ta şirket kayıt sürecinizi başlatın.",
    },
    {
      locale: "en",
      path: "/en",
      canonicalPath: "/en",
      trPath: "/",
      enPath: "/en",
      title: "Work and careers in Northern Cyprus",
      description:
        "Create your professional profile, manage your skills, and begin company registration in Northern Cyprus.",
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
      title: "Kuzey Kıbrıs’ta iş ve kariyer",
      direction: "ltr",
      directoryTitle: "Aradığınız şirketi bulun.",
      packageTitle: "İşe alım hakları, açık ve anlaşılır.",
      freelanceTitle: "Serbest çalışma deneyiminizi aday profilinizde düzenleyin.",
      socialImageAlt: "Girne Limanı ve Kuzey Kıbrıs kıyı şeridi",
    },
    {
      code: "en",
      prefix: "/en",
      title: "Work and careers in Northern Cyprus",
      direction: "ltr",
      directoryTitle: "Find the company you need.",
      packageTitle: "Hiring rights, clearly defined.",
      freelanceTitle: "Organise your freelance experience in your candidate profile.",
      socialImageAlt: "Kyrenia Harbour and the Northern Cyprus coastline",
    },
    {
      code: "ru",
      prefix: "/ru",
      title: "Работа и карьера на Северном Кипре",
      direction: "ltr",
      directoryTitle: "Найдите нужную компанию.",
      packageTitle: "Права на найм — чётко и прозрачно.",
      freelanceTitle: "Укажите опыт самостоятельной работы в профиле кандидата.",
      socialImageAlt: "Порт Кирении и побережье Северного Кипра",
    },
    {
      code: "el",
      prefix: "/el",
      title: "Εργασία και καριέρα στη Βόρεια Κύπρο",
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
      title: "کار و مسیر شغلی در قبرس شمالی",
      direction: "rtl",
      directoryTitle: "شرکت موردنیاز خود را پیدا کنید.",
      packageTitle: "حقوق استخدام، روشن و مشخص.",
      freelanceTitle: "تجربه کار مستقل را در پروفایل متقاضی خود سامان دهید.",
      socialImageAlt: "بندر گیرنه و خط ساحلی قبرس شمالی",
    },
    {
      code: "de",
      prefix: "/de",
      title: "Arbeit und Karriere in Nordzypern",
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
