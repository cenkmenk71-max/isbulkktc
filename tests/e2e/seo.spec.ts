import { expect, test } from "@playwright/test";

test("public routes expose localized canonical and social metadata", async ({
  page,
}) => {
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
      `${siteOrigin}/images/Girne.webp`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});

test("all advertised locales render with correct direction and complete SEO alternates", async ({
  page,
}) => {
  test.setTimeout(90_000);

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
  expect(robots).not.toContain("Disallow:");

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
});
