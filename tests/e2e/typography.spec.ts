import { expect, test } from "@playwright/test";

const pageHeadings = [
  { path: "/contact", selector: ".contact-hero h1" },
  { path: "/blog", selector: ".blog-hero h1" },
  { path: "/packages", selector: ".packages-hero-copy h1" },
  { path: "/companies", selector: ".company-directory-hero h1" },
  { path: "/freelance", selector: ".freelance-hero-copy h1" },
  { path: "/jobs", selector: ".jobs-hero h1" },
  { path: "/login", selector: ".editorial-page-heading h1" },
  { path: "/register", selector: ".editorial-page-heading h1" },
];

const localeDisplayFonts = [
  { path: "/", locale: "tr", font: "Literata" },
  { path: "/en", locale: "en", font: "Literata" },
  { path: "/ru", locale: "ru", font: "Literata" },
  { path: "/el", locale: "el", font: "Literata" },
  { path: "/fa", locale: "fa", font: "IBM Plex Sans Arabic" },
  { path: "/de", locale: "de", font: "Literata" },
] as const;

test("global display typography follows each locale's writing system", async ({
  page,
}) => {
  for (const { path, locale, font } of localeDisplayFonts) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    const typography = await page.locator("main h1").first().evaluate((heading) => ({
      displayFont: getComputedStyle(heading).fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily,
      direction: document.documentElement.dir,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    expect(typography.displayFont).toContain(font);
    if (locale === "fa") {
      expect(typography.bodyFont).toContain(font);
      expect(typography.direction).toBe("rtl");
    }
    expect(typography.documentWidth).toBeLessThanOrEqual(
      typography.viewportWidth,
    );
  }
});

test("shared navigation stays usable across locale-specific desktop widths", async ({
  page,
}) => {
  // Six locales are visited in one test and the default-locale homepage runs
  // animated 3D scenes; software WebGL in CI needs more than the 60s default.
  test.setTimeout(120_000);
  for (const { path, locale } of localeDisplayFonts) {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator(".desktop-nav")).toBeHidden();

    const menuButton = page.locator(".mobile-menu-button");
    const mobileNavigation = page.locator("#mobile-primary-navigation");
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.locator("a")).toHaveCount(9);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    await menuButton.click();
    await page.setViewportSize({ width: 1201, height: 900 });
    await expect(page.locator(".desktop-nav")).toBeVisible();
    await expect(menuButton).toBeHidden();
    await expect(page.locator(".desktop-nav a").first().locator("svg")).toHaveCSS(
      "display",
      "none",
    );

    const desktopMetrics = await page.evaluate(() => {
      const nav = document.querySelector(".desktop-nav")!.getBoundingClientRect();
      const actions = document.querySelector(".header-actions")!.getBoundingClientRect();
      const overlap = Math.min(nav.right, actions.right) - Math.max(nav.left, actions.left);
      const centerOf = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2;
      };
      const centers = [
        centerOf(".header-brand"),
        centerOf(".desktop-nav a"),
        centerOf(".language-switch"),
        centerOf(".header-login"),
        centerOf(".header-post"),
      ].filter((value): value is number => value !== null);
      return {
        overlap,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        headerCenterSpread: centers.length
          ? Math.max(...centers) - Math.min(...centers)
          : 0,
      };
    });
    expect(desktopMetrics.overlap).toBeLessThanOrEqual(1);
    expect(desktopMetrics.documentWidth).toBeLessThanOrEqual(
      desktopMetrics.viewportWidth,
    );
    // Brand, nav, language switch, sign-in, and the register CTA must share one
    // optical center line. Asymmetric padding or a stray margin on the CTA used
    // to push it ~6px below the rest of the bar.
    expect(desktopMetrics.headerCenterSpread).toBeLessThanOrEqual(1);
  }
});

test("freelance desktop hero keeps its headline within three lines", async ({
  page,
}) => {
  for (const { path, locale } of localeDisplayFonts) {
    for (const width of [1201, 1245, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      await page.goto(`${path === "/" ? "" : path}/freelance`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);

      const headingMetrics = await page
        .locator(".freelance-hero-copy h1")
        .evaluate((heading) => {
          const range = document.createRange();
          range.selectNodeContents(heading);
          return {
            lines: range.getClientRects().length,
            width: heading.getBoundingClientRect().width,
            fontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
          };
        });

      expect(headingMetrics.lines, `${locale} at ${width}px`).toBeLessThanOrEqual(3);
      expect(headingMetrics.width).toBeGreaterThan(0);
      expect(headingMetrics.fontSize).toBeGreaterThanOrEqual(46);
    }
  }
});

test("public page headings keep a restrained hierarchy on desktop and mobile", async ({
  page,
}) => {
  for (const { path, selector } of pageHeadings) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);

    const desktopHeading = page.locator(selector).first();
    await expect(desktopHeading).toBeVisible();
    const desktopMetrics = await desktopHeading.evaluate((heading) => {
      const style = getComputedStyle(heading);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        width: heading.getBoundingClientRect().width,
      };
    });
    expect(desktopMetrics.fontSize, `${path} desktop heading`).toBeLessThanOrEqual(
      64,
    );
    expect(desktopMetrics.fontSize, `${path} desktop heading`).toBeGreaterThanOrEqual(
      35,
    );
    expect(desktopMetrics.lineHeight, `${path} desktop line height`).toBeGreaterThanOrEqual(
      desktopMetrics.fontSize,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMetrics = await desktopHeading.evaluate((heading) => {
      const style = getComputedStyle(heading);
      const rect = heading.getBoundingClientRect();
      return {
        fontSize: Number.parseFloat(style.fontSize),
        right: rect.right,
        width: rect.width,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(mobileMetrics.fontSize, `${path} mobile heading`).toBeLessThanOrEqual(
      48,
    );
    expect(mobileMetrics.right, `${path} mobile heading overflow`).toBeLessThanOrEqual(
      mobileMetrics.viewportWidth + 1,
    );
    expect(mobileMetrics.width).toBeGreaterThan(0);
  }
});

test("account scene and secondary section headings stay subordinate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");

  const sceneHeading = page.locator(".editorial-page-scene-copy h2");
  await expect(sceneHeading).toBeVisible();
  await expect
    .poll(() =>
      sceneHeading.evaluate((heading) =>
        Number.parseFloat(getComputedStyle(heading).fontSize),
      ),
    )
    .toBeLessThanOrEqual(42);

  await page.goto("/contact");
  const sectionHeading = page.locator(".contact-panel-heading h2");
  await expect(sectionHeading).toBeVisible();
  await expect
    .poll(() =>
      sectionHeading.evaluate((heading) =>
        Number.parseFloat(getComputedStyle(heading).fontSize),
      ),
    )
    .toBeLessThanOrEqual(32);
});
