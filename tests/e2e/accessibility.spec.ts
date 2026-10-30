import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * A design that is only checked by eye regresses silently: a colour tweak can
 * drop a label below AA, a smaller control can lose its touch target, or a
 * heading can skip a level. axe-core runs the same rules a manual accessibility
 * audit would, on every locale, so a "micro" visual change cannot ship a
 * regression that nobody notices.
 */

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

const publicRoutes = [
  { path: "/", name: "home" },
  { path: "/jobs", name: "jobs" },
  { path: "/companies", name: "companies" },
  { path: "/freelance", name: "freelance" },
  { path: "/packages", name: "packages" },
  { path: "/about", name: "about" },
  { path: "/blog", name: "blog" },
  { path: "/contact", name: "contact" },
  { path: "/login", name: "login" },
  { path: "/register", name: "register" },
  { path: "/privacy", name: "privacy" },
  { path: "/cookies", name: "cookies" },
  { path: "/terms", name: "terms" },
] as const;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

// Desktop layout is shared across locales, so auditing it in every language
// would only re-run the same rules. German has the longest strings, Persian is
// the RTL reference, and Turkish is the default: those three cover the layout
// risks. Every locale is still audited at mobile width, where the routes differ
// most.
const desktopLocales = new Set(["tr", "de", "fa"]);

function localePrefix(locale: string): string {
  return locale === "tr" ? "" : `/${locale}`;
}

for (const locale of locales) {
  test(`axe finds no accessibility violations in ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const violations: string[] = [];
    const activeViewports = desktopLocales.has(locale)
      ? viewports
      : [viewports[0]];

    for (const viewport of activeViewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const route of publicRoutes) {
        await page.goto(`${localePrefix(locale)}${route.path}`, {
          waitUntil: "domcontentloaded",
        });
        // Animated hero scenes settle late; auditing mid-animation produces
        // transient contrast findings that are not real.
        await page.waitForTimeout(600);
        // The consent card is a client component, so it mounts only after
        // hydration and then plays a short entrance animation. If that animation
        // is still running, axe measures the card's text at partial opacity and
        // reports a color-contrast violation that no settled user ever sees.
        // Wait for finite animations to finish (bounded, and ignoring looping
        // ones such as the hero rays) so the audit reflects the resting state.
        await page
          .waitForFunction(
            () =>
              document
                .getAnimations()
                .filter((animation) => animation.playState === "running")
                .every((animation) => {
                  const timing = animation.effect?.getComputedTiming?.();
                  return timing?.iterations === Infinity;
                }),
            undefined,
            { timeout: 3000 },
          )
          .catch(() => {});

        const results = await new AxeBuilder({ page })
          // wcag22aa adds the 2.2 success criteria axe can automate, notably
          // target-size (2.5.8): a control must be at least 24x24 CSS px or
          // spaced so an undersized one is not the only target.
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        for (const violation of results.violations) {
          const nodes = violation.nodes
            .slice(0, 2)
            .map((node) => node.target.join(" "))
            .join(", ");
          violations.push(
            `${locale}${route.path} @${viewport.name}: [${violation.id}] ${violation.help} -> ${nodes}`,
          );
        }
      }
    }

    expect(
      violations,
      `Accessibility violations found:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
}
